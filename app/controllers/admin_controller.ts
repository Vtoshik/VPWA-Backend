import type { HttpContext } from '@adonisjs/core/http'
import { getSocketIO } from '#services/socket_provider'

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
}
