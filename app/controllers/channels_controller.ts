import type { HttpContext } from '@adonisjs/core/http'
import UserChannel from '#models/user_channel'
import Channel from '#models/channel'
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

            // Broadcast with Socket.IO
            const socketIO = getSocketIO()
            socketIO.broadcastChannelCreated(channel.serialize(), [user.id])

            return response.created({ channel: channel.serialize() })
        } catch(err) {
            console.log(err)
            return response.internalServerError({ message: 'Failed to create channel' })
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
        const { userId } = request.only(['userId'])

        try {
            const channel = await Channel.find(channelId)
            if (!channel) {
                return response.notFound({ message: 'Channel not found' })
            }

            if (channel.isPrivate && channel.adminId !== user.id) {
                return response.forbidden({ message: 'Only admin can invite to private channel' })
            }

            const existingMember = await UserChannel.query()
                .where('user_id', userId)
                .where('channel_id', channelId)
                .first()

            if (existingMember) {
                return response.conflict({ message: 'User already member' })
            }

            const invite = await Invite.create({
                fromUserId: user.id,
                toUserId: userId,
                channelId,
                status: 'pending'
            })

            const socketIO = getSocketIO()
            socketIO.sendInvite(userId, {
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
        const { userId } = request.only(['userId'])

        try {
            const channel = await Channel.find(channelId)
            if (!channel) {
                return response.notFound({ message: 'Channel not found' })
            }

            if (user.id === channel.adminId) {
                await UserChannel.query()
                    .where('user_id', userId)
                    .where('channel_id', channelId)
                    .delete()

                await Ban.create({
                    userId,
                    channelId,
                    bannedBy: [user.id],
                    isPermanent: true,
                    reason: 'Kicked by admin',
                })

                const socketIO = getSocketIO()
                socketIO.notifyKick(userId, {
                    channelId,
                    channelName: channel.name,
                    kickedBy: user.nickname
                })

                return response.ok({ message: 'User kicked successfully' })
            }

            let ban = await Ban.query()
                .where('user_id', userId)
                .where('channel_id', channelId)
                .first()

            if (!ban) {
                ban = await Ban.create({
                    userId,
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
                        .where('user_id', userId)
                        .where('channel_id', channelId)
                        .delete()

                    ban.isPermanent = true
                    await ban.save()

                    const socketIO = getSocketIO()
                    socketIO.notifyKick(userId, {
                        channelId,
                        channelName: channel.name,
                        kickedBy: 'Community vote',
                    })

                    return response.ok({ message: 'User kicked by community vote' })
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
}