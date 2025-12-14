import type { HttpContext } from '@adonisjs/core/http'
import Invite from '#models/invite'
import UserChannel from '#models/user_channel'
import { DateTime } from 'luxon'
import { getSocketIO } from '#services/socket_provider'

export default class InvitesController {
  async index({ auth, response }: HttpContext) {
    const user = auth.user!

    try {
      const invites = await Invite.query()
        .where('to_user_id', user.id)
        .where('status', 'pending')
        .preload('fromUser')
        .preload('channel')
        .orderBy('created_at', 'desc')

      const serializedInvites = invites.map(invite => ({
        id: invite.id,
        channelId: invite.channelId,
        channelName: invite.channel.name,
        fromUserId: invite.fromUserId,
        fromNickname: invite.fromUser.nickname,
        status: invite.status,
        createdAt: invite.createdAt,
      }))

      return response.ok({ invites: serializedInvites })
    } catch (err) {
      console.log(err)
      return response.internalServerError({ message: 'Failed to fetch invites' })
    }
  }

  async accept({ params, auth, response }: HttpContext) {
    const user = auth.user!
    const inviteId = params.id

    try {
      console.log('Accept invite - inviteId:', inviteId, 'type:', typeof inviteId)

      // Validate inviteId
      if (!inviteId || isNaN(Number(inviteId))) {
        console.error('Invalid inviteId:', inviteId)
        return response.badRequest({ message: 'Invalid invite ID' })
      }

      const invite = await Invite.query()
        .where('id', inviteId)
        .where('to_user_id', user.id)
        .where('status', 'pending')
        .preload('channel')
        .first()

      if (!invite) {
        console.log('Invite not found for inviteId:', inviteId)
        return response.notFound({ message: 'Invite not found' })
      }

      console.log('Found invite:', {
        id: invite.id,
        channelId: invite.channelId,
        channelIdType: typeof invite.channelId,
        hasChannel: !!invite.channel,
      })

      // Validate channelId from database
      if (!invite.channelId || isNaN(Number(invite.channelId))) {
        console.error('Invalid channelId in invite:', invite.channelId)
        return response.internalServerError({ message: 'Invalid channel data' })
      }

      const existingMember = await UserChannel.query().where('user_id', user.id)
        .where('channel_id', invite.channelId).first()

      if (existingMember) {
        invite.status = 'accepted'
        await invite.save()
        return response.conflict({ message: 'Already a member of this channel' })
      }

      await UserChannel.create({
        userId: user.id,
        channelId: invite.channelId,
        isSelected: false,
        joinedAt: DateTime.now(),
      })

      // Mark this invite as accepted
      invite.status = 'accepted'
      await invite.save()

      // Auto-reject all other pending invites to the same channel
      await Invite.query()
        .where('to_user_id', user.id)
        .where('channel_id', invite.channelId)
        .where('status', 'pending')
        .whereNot('id', invite.id)
        .update({ status: 'accepted' })

      invite.channel.lastActivity = DateTime.now()
      await invite.channel.save()

      // Broadcast to all channel members that a new user joined
      const socketIO = getSocketIO()
      socketIO.getIO().to(`channel:${invite.channelId}`).emit('user:joined-channel', {
        userId: user.id,
        nickname: user.nickname,
        channelId: invite.channelId,
        channelName: invite.channel.name,
      })

      return response.ok({
        message: 'Invite accepted',
        channel: invite.channel.serialize(),
      })
    } catch (err) {
      console.log(err)
      return response.internalServerError({ message: 'Failed to accept invite' })
    }
  }

  async reject({ params, auth, response }: HttpContext) {
    const user = auth.user!
    const inviteId = params.id

    try {
      const invite = await Invite.query()
        .where('id', inviteId)
        .where('to_user_id', user.id)
        .where('status', 'pending')
        .first()

      if (!invite) {
        return response.notFound({ message: 'Invite not found' })
      }

      invite.status = 'rejected'
      await invite.save()

      return response.ok({ message: 'Invite rejected' })
    } catch (err) {
      console.log(err)
      return response.internalServerError({ message: 'Failed to reject invite' })
    }
  }
}
