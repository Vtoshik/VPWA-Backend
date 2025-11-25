import { DateTime } from 'luxon'
import Channel from '#models/channel'
import logger from '@adonisjs/core/services/logger'

export default class ChannelCleanupService {
  private intervalId: NodeJS.Timeout | null = null
  private readonly CLEANUP_INTERVAL_HOURS = 6
  private readonly INACTIVE_DAYS = 30

  start() {
    this.cleanupInactiveChannels()

    const intervalMs = this.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000
    this.intervalId = setInterval(() => {
      this.cleanupInactiveChannels()
    }, intervalMs)

    logger.info(`Channel cleanup service started - runs on startup and every ${this.CLEANUP_INTERVAL_HOURS} hours`)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      logger.info('Channel cleanup service stopped')
    }
  }

  async cleanupInactiveChannels() {
    try {
      const cutoffDate = DateTime.now().minus({ days: this.INACTIVE_DAYS })

      // Find all channels with last activity older than 30 days
      const inactiveChannels = await Channel.query()
        .where('last_activity', '<', cutoffDate.toSQL())
        .select('id', 'name', 'last_activity')

      if (inactiveChannels.length === 0) {
        logger.info('Channel cleanup: No inactive channels found')
        return
      }

      logger.info(`Channel cleanup: Found ${inactiveChannels.length} inactive channels to delete`)

      for (const channel of inactiveChannels) {
        const channelName = channel.name
        const lastActivity = channel.lastActivity.toISO()

        await channel.delete()

        logger.info(`Channel cleanup: Deleted "${channelName}" (last activity: ${lastActivity})`)
      }

      logger.info(`Channel cleanup: Completed - deleted ${inactiveChannels.length} channels`)
    } catch (error) {
      logger.error('Channel cleanup: Error during cleanup:', error)
    }
  }

  async triggerCleanup() {
    logger.info('Channel cleanup: Manual trigger')
    await this.cleanupInactiveChannels()
  }
}
