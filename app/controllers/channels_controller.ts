import type { HttpContext } from '@adonisjs/core/http'
import UserChannel from '#models/user_channel'
import Channel from '#models/channel'
import User from '#models/user'
import { getSocketIO } from '#services/socket_provider'
import { DateTime } from 'luxon'
import Invite from '#models/invite'
import Ban from '#models/ban'

export default class ChannelsController {
    async index({ auth, response }: HttpContext) {
        const user = auth.user!
        try {
            const userChannels = await UserChannel.query()
                .where('user_id', user.id)
                .preload('channel')

            const channels = userChannels.map(uc => uc.channel.serialize())

            return response.ok({ channels })
        } catch (err) {
            console.log(err)
            return response.internalServerError({ message: 'Failed to fetch channels' })
        }
    }

    async create({ request, auth, response }: HttpContext){
        const user = auth.user!
        const { name, isPrivate } = request.only(['name', 'isPrivate'])

        try {
            const existingChannel = await Channel.query().where('name', name).first()
            if (existingChannel) {
                return response.conflict({ message: 'Channel already exists'})
            }

            const channel = await Channel.create({
                name,
                adminId: user.id,
                isPrivate: isPrivate || false,
                lastActivity: DateTime.now(),
            })

            await UserChannel.create({
                userId: user.id,
                channelId: channel.id,
                isSelected: true,
                joinedAt: DateTime.now(),
            })

            const socketIO = getSocketIO()
            socketIO.broadcastChannelCreated(channel.serialize(), [user.id])

            return response.created({ channel: channel.serialize() })
        } catch(err) {
            console.log(err)
            return response.internalServerError({ message: 'Failed to create channel' })
        }
    }

    async join({ request, auth, response }: HttpContext){
        const user = auth.user!
        const { channelName, name, isPrivate } = request.only(['channelName', 'name', 'isPrivate'])

        // Support both 'channelName' and 'name' parameters
        const finalChannelName = channelName || name

        if (!finalChannelName) {
            return response.badRequest({ message: 'Channel name is required' })
        }

        try {
            let channel = await Channel.query().where('name', finalChannelName).first()

            if (!channel) {
                channel = await Channel.create({
                    name: finalChannelName,
                    adminId: user.id,
                    isPrivate: isPrivate || false,
                    lastActivity: DateTime.now(),
                })

                await UserChannel.create({
                    userId: user.id,
                    channelId: channel.id,
                    isSelected: true,
                    joinedAt: DateTime.now(),
                })

                const socketIO = getSocketIO()
                socketIO.broadcastChannelCreated(channel.serialize(), [user.id])

                return response.created({
                    channel: channel.serialize(),
                    message: 'Channel created and joined'
                })
            }

            if (channel.isPrivate) {
                return response.forbidden({
                    message: 'Cannot join private channel without invitation'
                })
            }

            const ban = await Ban.query()
                .where('user_id', user.id)
                .where('channel_id', channel.id)
                .where('is_permanent', true)
                .first()

            if (ban) {
                return response.forbidden({ message: 'You are banned from this channel' })
            }

            const existingMember = await UserChannel.query()
                .where('user_id', user.id)
                .where('channel_id', channel.id)
                .first()

            if (existingMember) {
                return response.conflict({ message: 'Already a member of this channel' })
            }

            await UserChannel.create({
                userId: user.id,
                channelId: channel.id,
                isSelected: true,
                joinedAt: DateTime.now(),
            })

            channel.lastActivity = DateTime.now()
            await channel.save()

            const socketIO = getSocketIO()
            socketIO.getIO().to(`channel:${channel.id}`).emit('user:joined-channel', {
                userId: user.id,
                nickname: user.nickname,
                channelId: channel.id,
                channelName: channel.name,
            })

            return response.ok({
                channel: channel.serialize(),
                message: 'Joined channel successfully'
            })

        } catch(err) {
            console.log(err)
            return response.internalServerError({ message: 'Failed to join channel' })
        }
    }

    async members({ params, auth, response }: HttpContext){
        const user = auth.user!
        const channelId = params.id
        try {
            const membership = await UserChannel.query()
                .where('user_id', user.id)
                .where('channel_id', channelId)
                .first()

            if (!membership) {
                return response.forbidden({ message: 'Not a member of this channel' })
            }

            const members = await UserChannel.query()
                .where('channel_id', channelId)
                .preload('user')

            const membersList = members.map(m => ({
                userId: m.user.id,
                nickname: m.user.nickname,
                status: m.user.status,
                joinedAt: m.joinedAt,
            }))

            return response.ok({ members: membersList })
        } catch(err) {
            console.log(err)
            return response.internalServerError({ message: 'Failed to fetch members' })
        }
    }

    async leave({ params, auth, response }: HttpContext){
        const user = auth.user!
        const channelId = params.id

        try {
            const channel = await Channel.find(channelId)
            if (!channel) {
                return response.notFound({ message: 'Channel not found' })
            }

            const membership = await UserChannel.query()
                .where('user_id', user.id)
                .where('channel_id', channelId)
                .first()

            if (!membership) {
                return response.notFound({ message: 'Not a member' })
            }

            const socketIO = getSocketIO()

            if (user.id === channel.adminId) {
                await channel.delete()
                socketIO.broadcastChannelDeleted(channelId)

                return response.ok({ message: 'Channel deleted (admin left channel)' })
            }

            await membership.delete()
            socketIO.getIO().to(`channel:${channelId}`).emit('user:left-channel', {
                userId: user.id,
                nickname: user.nickname,
                channelId,
            })

            return response.ok({ message: 'Left channel successfully' })

        } catch(err) {
            console.log(err)
            return response.internalServerError({ message: 'Failed to leave channel' })
        }
    }

    async destroy({ params, auth, response }: HttpContext){
        const user = auth.user!
        const channelId = params.id

        try {
            const channel = await Channel.find(channelId)
            if (!channel) {
                return response.notFound({ message: 'Channel not found' })
            }

            if (channel.adminId !== user.id) {
                return response.forbidden({ message: 'Only admin can delete channel' })
            }

            await channel.delete()

            const socketIO = getSocketIO()
            socketIO.broadcastChannelDeleted(channelId)

            return response.ok({ message: 'Channel deleted successfully' })
        } catch(err) {
            console.log(err)
            return response.internalServerError({ message: 'Failed to delete channel' })
        }
    }

    async invite({ request, params, auth, response }: HttpContext){
        const user = auth.user!
        const channelId = params.id
        const { userId, nickname } = request.only(['userId', 'nickname'])

        try {
            const channel = await Channel.find(channelId)
            if (!channel) {
                return response.notFound({ message: 'Channel not found' })
            }

            // Check if user is a member of the channel
            const membership = await UserChannel.query()
                .where('user_id', user.id)
                .where('channel_id', channelId)
                .first()

            if (!membership) {
                return response.forbidden({ message: 'You must be a member to invite others' })
            }

            // For private channels, only admin can invite
            if (channel.isPrivate && channel.adminId !== user.id) {
                return response.forbidden({ message: 'Only admin can invite to private channel' })
            }

            // Support both userId and nickname
            let targetUserId = userId

            if (!targetUserId && nickname) {
                const targetUser = await User.query().where('nickname', nickname).first()
                if (!targetUser) {
                    return response.notFound({ message: 'User not found' })
                }
                targetUserId = targetUser.id
            }

            if (!targetUserId) {
                return response.badRequest({ message: 'Either userId or nickname is required' })
            }

            const existingMember = await UserChannel.query()
                .where('user_id', targetUserId)
                .where('channel_id', channelId)
                .first()

            if (existingMember) {
                return response.conflict({ message: 'User already member' })
            }

            // Check if user is banned - admin can unban via invite
            const ban = await Ban.query()
                .where('user_id', targetUserId)
                .where('channel_id', channelId)
                .where('is_permanent', true)
                .first()

            if (ban) {
                // Only admin can unban
                if (channel.adminId === user.id) {
                    await ban.delete()
                    // Don't send invite, admin is unbanning
                    return response.ok({ message: 'User unbanned successfully' })
                } else {
                    return response.forbidden({ message: 'User is banned from this channel' })
                }
            }

            // Check if there's already a pending invite
            const existingInvite = await Invite.query()
                .where('to_user_id', targetUserId)
                .where('channel_id', channelId)
                .where('status', 'pending')
                .first()

            if (existingInvite) {
                return response.conflict({
                    message: 'User already has a pending invite to this channel'
                })
            }

            const invite = await Invite.create({
                fromUserId: user.id,
                toUserId: targetUserId,
                channelId,
                status: 'pending'
            })

            const socketIO = getSocketIO()
            socketIO.sendInvite(targetUserId, {
                inviteId: invite.id,
                channelId,
                channelName: channel.name,
                fromNickname: user.nickname,
            })

            return response.ok({ invite: invite.serialize() })
        } catch(err) {
            console.log(err)
            return response.internalServerError({ message: 'Failed to send invite' })
        }
    }

    async kick({ request, params, auth, response }: HttpContext){
        const user = auth.user!
        const channelId = params.id
        const { userId, nickname } = request.only(['userId', 'nickname'])

        try {
            const channel = await Channel.find(channelId)
            if (!channel) {
                return response.notFound({ message: 'Channel not found' })
            }

            // /kick only works in public channels
            if (channel.isPrivate) {
                return response.forbidden({ message: 'Use /revoke in private channels' })
            }

            // Check if user is a member
            const membership = await UserChannel.query()
                .where('user_id', user.id)
                .where('channel_id', channelId)
                .first()

            if (!membership) {
                return response.forbidden({ message: 'You must be a member to kick others' })
            }

            // Support both userId and nickname
            let targetUserId = userId

            if (!targetUserId && nickname) {
                const targetUser = await User.query().where('nickname', nickname).first()
                if (!targetUser) {
                    return response.notFound({ message: 'User not found' })
                }
                targetUserId = targetUser.id
            }

            if (!targetUserId) {
                return response.badRequest({ message: 'Either userId or nickname is required' })
            }

            // Cannot kick yourself
            if (user.id === targetUserId) {
                return response.badRequest({ message: 'Cannot kick yourself, use /cancel to leave' })
            }

            // Cannot kick the channel admin
            if (targetUserId === channel.adminId) {
                return response.forbidden({ message: 'Cannot kick the channel admin' })
            }

            // Admin can kick immediately with permanent ban
            if (user.id === channel.adminId) {
                await UserChannel.query()
                    .where('user_id', targetUserId)
                    .where('channel_id', channelId)
                    .delete()

                await Ban.create({
                    userId: targetUserId,
                    channelId,
                    bannedBy: [user.id],
                    isPermanent: true,
                    reason: 'Kicked by admin',
                })

                const socketIO = getSocketIO()
                socketIO.notifyKick(targetUserId, {
                    channelId,
                    channelName: channel.name,
                    kickedBy: user.nickname
                })

                return response.ok({ message: 'User kicked permanently by admin' })
            }

            // Non-admin: voting system (3+ votes = permanent ban)
            let ban = await Ban.query()
                .where('user_id', targetUserId)
                .where('channel_id', channelId)
                .first()

            if (!ban) {
                ban = await Ban.create({
                    userId: targetUserId,
                    channelId,
                    bannedBy: [user.id],
                    isPermanent: false,
                    reason: 'Voted for kick',
                })
                return response.ok({ message: 'Vote registered (1/3)' })
            }

            if (!ban.bannedBy.includes(user.id)) {
                ban.bannedBy = [...ban.bannedBy, user.id]
                await ban.save()

                if (ban.bannedBy.length >= 3) {
                    await UserChannel.query()
                        .where('user_id', targetUserId)
                        .where('channel_id', channelId)
                        .delete()

                    ban.isPermanent = true
                    await ban.save()

                    const socketIO = getSocketIO()
                    socketIO.notifyKick(targetUserId, {
                        channelId,
                        channelName: channel.name,
                        kickedBy: 'Community vote',
                    })

                    return response.ok({ message: 'User kicked permanently by community vote' })
                }

                return response.ok({
                    message: `Vote registered (${ban.bannedBy.length}/3)`
                })
            }

            return response.conflict({ message: 'You already voted to kick this user' })

        } catch(err) {
            console.log(err)
            return response.internalServerError({ message: 'Failed to kick user' })
        }
    }

    // /revoke - admin only command for private channels
    async revoke({ request, params, auth, response }: HttpContext){
        const user = auth.user!
        const channelId = params.id
        const { userId, nickname } = request.only(['userId', 'nickname'])

        try {
            const channel = await Channel.find(channelId)
            if (!channel) {
                return response.notFound({ message: 'Channel not found' })
            }

            // /revoke only works in private channels
            if (!channel.isPrivate) {
                return response.forbidden({ message: 'Use /kick in public channels' })
            }

            // Only admin can revoke in private channels
            if (channel.adminId !== user.id) {
                return response.forbidden({ message: 'Only admin can revoke members from private channel' })
            }

            // Support both userId and nickname
            let targetUserId = userId

            if (!targetUserId && nickname) {
                const targetUser = await User.query().where('nickname', nickname).first()
                if (!targetUser) {
                    return response.notFound({ message: 'User not found' })
                }
                targetUserId = targetUser.id
            }

            if (!targetUserId) {
                return response.badRequest({ message: 'Either userId or nickname is required' })
            }

            // Cannot revoke yourself
            if (user.id === targetUserId) {
                return response.badRequest({ message: 'Cannot revoke yourself, use /quit to delete channel' })
            }

            // Remove user from channel
            const deleted = await UserChannel.query()
                .where('user_id', targetUserId)
                .where('channel_id', channelId)
                .delete()

            if (deleted.length === 0) {
                return response.notFound({ message: 'User is not a member of this channel' })
            }

            // Create permanent ban for private channel
            await Ban.create({
                userId: targetUserId,
                channelId,
                bannedBy: [user.id],
                isPermanent: true,
                reason: 'Revoked by admin',
            })

            const socketIO = getSocketIO()
            socketIO.notifyKick(targetUserId, {
                channelId,
                channelName: channel.name,
                kickedBy: user.nickname
            })

            return response.ok({ message: 'User revoked from private channel' })
        } catch(err) {
            console.log(err)
            return response.internalServerError({ message: 'Failed to revoke user' })
        }
    }
}