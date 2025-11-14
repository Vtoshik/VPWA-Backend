import type { HttpContext } from '@adonisjs/core/http'
import transmit from '@adonisjs/transmit/services/main'
import { DateTime } from 'luxon'
import Message from '#models/message'
import Channel from '#models/channel'

export default class ChatsController {
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

    const message = await Message.create({
      userId: user.id,
      channelId: channelId,
      text: text,
      sendAt: DateTime.now(),
    })

    await message.load('user')

    channel.lastActivity = DateTime.now()
    await channel.save()

    transmit.broadcast(`channels/${channelId}`, {
      type: 'message',
      data: message.serialize(),
    })

    return response.ok({ message: message.serialize() })
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

    const messages = await Message.query()
      .where('channel_id', channelId)
      .preload('user')
      .orderBy('send_at', 'desc')
      .paginate(page, limit)

    return response.ok(messages.serialize())
  }
}