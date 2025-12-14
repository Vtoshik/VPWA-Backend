import type { HttpContext } from '@adonisjs/core/http'
import { getSocketIO } from '#services/socket_provider'
import Channel from '#models/channel'
import UserChannel from '#models/user_channel'
import { DateTime } from 'luxon'

export default class AdminController {
  /**
   * Manually trigger channel cleanup
   * For testing/debugging purposes
   */
  async triggerCleanup({ auth, response }: HttpContext) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ message: 'Unauthorized' })
    }

    try {
      const socketService = getSocketIO()
      const cleanupService = socketService.getCleanupService()

      await cleanupService.triggerCleanup()

      return response.ok({ message: 'Channel cleanup triggered successfully' })
    } catch (err) {
      console.log(err)
      return response.internalServerError({ message: 'Failed to trigger cleanup' })
    }
  }

  /**
   * Create an old channel for testing cleanup (30+ days old)
   * For testing purposes only
   */
  async createOldChannel({ auth, request, response }: HttpContext) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ message: 'Unauthorized' })
    }

    try {
      const { daysOld } = request.only(['daysOld'])
      const days = daysOld || 31 // Default 31 days

      // Create channel with old last_activity
      const channel = await Channel.create({
        name: `old-test-${Date.now()}`,
        adminId: user.id,
        isPrivate: false,
        lastActivity: DateTime.now().minus({ days }),
        createdAt: DateTime.now().minus({ days }),
      })

      // Add user as member
      await UserChannel.create({
        userId: user.id,
        channelId: channel.id,
        isSelected: false,
        joinedAt: DateTime.now().minus({ days }),
      })

      return response.created({
        message: `Created old channel (${days} days old)`,
        channel: {
          id: channel.id,
          name: channel.name,
          lastActivity: channel.lastActivity.toISO(),
          daysOld: days,
        },
      })
    } catch (err) {
      console.log(err)
      return response.internalServerError({ message: 'Failed to create old channel' })
    }
  }
}
