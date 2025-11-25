import type { HttpContext } from '@adonisjs/core/http'
import { getSocketIO } from '#services/socket_provider'
import { DateTime } from 'luxon'
import Message from '#models/message'
import Channel from '#models/channel'
import User from '#models/user'
import MentionedUser from '#models/mentioned_user'

export default class ChatsController {
  // Helper function to extract @mentions from text
  private extractMentions(text: string): string[] {
    // Match @nickname (alphanumeric + underscore, must not be followed by more word chars)
    const mentionRegex = /@(\w+)/g
    const mentions: string[] = []
    let match

    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1])
    }

    return [...new Set(mentions)] // Remove duplicates
  }

  async sendMessage({ request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthorized' })
    }

    const { channelId, text } = request.only(['channelId', 'text'])

    const channel = await Channel.query()
      .where('id', channelId)
      .preload('userChannels', (query) => {
        query.where('user_id', user.id)
      })
      .first()

    if (!channel || channel.userChannels.length === 0) {
      return response.forbidden({ message: 'Not a member of this channel' })
    }

    // Create message
    const message = await Message.create({
      userId: user.id,
      channelId: channelId,
      text: text,
      sendAt: DateTime.now(),
    })

    await message.load('user')

    // Extract and process @mentions
    const mentionedNicknames = this.extractMentions(text)
    const mentionedUserIds: number[] = []

    if (mentionedNicknames.length > 0) {
      // Find users by nicknames
      const mentionedUsers = await User.query().whereIn('nickname', mentionedNicknames)

      // Save mentions to database
      for (const mentionedUser of mentionedUsers) {
        await MentionedUser.create({
          messageId: message.id,
          userId: mentionedUser.id,
        })
        mentionedUserIds.push(mentionedUser.id)
      }
    }

    channel.lastActivity = DateTime.now()
    await channel.save()

    // Serialize message with mentioned user IDs
    const serializedMessage = {
      ...message.serialize(),
      mentionedUserIds,
    }

    const socketIO = getSocketIO()
    socketIO.broadcastMessage(channelId, serializedMessage)

    return response.ok({ message: serializedMessage })
  }

  async getMessages({ request, auth, response, params }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthorized' })
    }

    const channelId = params.id
    const page = request.input('page', 1)
    const limit = request.input('limit', 50)

    const channel = await Channel.query()
      .where('id', channelId)
      .preload('userChannels', (query) => {
        query.where('user_id', user.id)
      })
      .first()

    if (!channel || channel.userChannels.length === 0) {
      return response.forbidden({ message: 'Not a member of this channel' })
    }

    const messagesPagination = await Message.query()
      .where('channel_id', channelId)
      .preload('user')
      .preload('mentions')
      .orderBy('send_at', 'desc')
      .paginate(page, limit)

    // Serialize messages properly
    const messages = messagesPagination.all()
    const serializedMessages = messages.map((message) => ({
      id: message.id,
      userId: message.userId,
      channelId: message.channelId,
      text: message.text,
      sendAt: message.sendAt.toISO(),
      user: message.user ? {
        id: message.user.id,
        nickname: message.user.nickname,
        email: message.user.email,
        status: message.user.status,
      } : null,
      mentionedUserIds: message.mentions?.map((m) => m.userId) || [],
    }))

    return response.ok({
      data: serializedMessages,
      meta: messagesPagination.getMeta(),
    })
  }
}