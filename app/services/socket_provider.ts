import type { ApplicationService } from '@adonisjs/core/types'
import SocketService from '#services/socket_service'

export default class SocketProvider {
  private static instance: SocketService | null = null

  constructor(protected app: ApplicationService) {}

  async boot() {
  }

  static setInstance(instance: SocketService) {
    this.instance = instance
  }

  static getInstance(): SocketService {
    if (!this.instance) {
      throw new Error('Socket.IO service not initialized.')
    }
    return this.instance
  }
}

export function getSocketIO(): SocketService {
  return SocketProvider.getInstance()
}
