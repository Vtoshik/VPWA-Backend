import { Server as SocketIOServer } from 'socket.io'
import type { Server as HttpServer } from 'http'
import User from '#models/user'
import { createHash } from 'node:crypto'
import ChannelCleanupService from './channel_cleanup_service.js'
import Channel from '#models/channel'

export default class SocketService {
  private io: SocketIOServer
  private userSockets: Map<number, Set<string>> = new Map()
  private cleanupService: ChannelCleanupService

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:9000',
        credentials: true,
      },
    })

    this.setupMiddleware()
    this.setupEventHandlers()

    // Start channel cleanup service
    this.cleanupService = new ChannelCleanupService()
    this.cleanupService.start()
  }

  private setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token as string

        if (!token) {
          return next(new Error('Authentication token required'))
        }

        // Token format: "oat_<base64_token_id>.<secret>"
        // Extract token ID and secret
        const parts = token.split('.')
        if (parts.length !== 2 || !parts[0].startsWith('oat_')) {
          return next(new Error('Invalid token format'))
        }

        const encodedTokenId = parts[0].replace('oat_', '')
        const encodedSecret = parts[1]

        // Decode base64 token ID to get the actual numeric ID
        const tokenId = parseInt(Buffer.from(encodedTokenId, 'base64').toString('utf-8'), 10)

        if (isNaN(tokenId)) {
          return next(new Error('Invalid token ID'))
        }

        // Decode base64 secret to get the actual secret
        const secret = Buffer.from(encodedSecret, 'base64').toString('utf-8')

        // Find token in database by token ID
        const { default: db } = await import('@adonisjs/lucid/services/db')
        const accessTokenRecord = await db
          .from('auth_access_tokens')
          .where('id', tokenId)
          .first()

        if (!accessTokenRecord) {
          return next(new Error('Token not found'))
        }

        // Verify the secret matches the stored hash
        // AdonisJS uses SHA256 for access tokens, not bcrypt
        const secretHash = createHash('sha256').update(secret).digest('hex')

        if (secretHash !== accessTokenRecord.hash) {
          return next(new Error('Invalid authentication token'))
        }

        // Load user
        const user = await User.find(accessTokenRecord.tokenable_id)

        if (!user) {
          return next(new Error('User not found'))
        }

        socket.data.user = user
        socket.data.userId = user.id

        next()
      } catch (error) {
        console.error('Socket auth error:', error)
        next(new Error('Authentication failed'))
      }
    })
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const user = socket.data.user
      console.log(`User ${user.nickname} connected (socket: ${socket.id})`)

      // Add socket to user's set of connections
      if (!this.userSockets.has(user.id)) {
        this.userSockets.set(user.id, new Set())
      }
      this.userSockets.get(user.id)!.add(socket.id)

      this.handleChannelEvents(socket)
      this.handleMessageEvents(socket)
      this.handleTypingEvents(socket)
      this.handleUserEvents(socket)

      socket.on('disconnect', () => {
        console.log(`User ${user.nickname} disconnected`)
        const userSocketSet = this.userSockets.get(user.id)
        if (userSocketSet) {
          userSocketSet.delete(socket.id)
          // Remove the set if empty
          if (userSocketSet.size === 0) {
            this.userSockets.delete(user.id)
          }
        }
      })
    })
  }

  private handleChannelEvents(socket: any) {
    const user = socket.data.user

    socket.on('channel:join', async (data: { channelId: number }) => {
      try {
        // Validate channelId
        if (!data.channelId || isNaN(data.channelId) || !Number.isInteger(data.channelId)) {
          console.error(`${user.nickname} tried to join invalid channel:`, data.channelId)
          socket.emit('error', { message: 'Invalid channel ID' })
          return
        }

        socket.join(`channel:${data.channelId}`)
        console.log(`${user.nickname} joined channel:${data.channelId}`)

        this.io.to(`channel:${data.channelId}`).emit('user:joined-channel', {
          userId: user.id,
          nickname: user.nickname,
          channelId: data.channelId,
        })
      } catch (error) {
        console.error('Error in channel:join:', error)
        socket.emit('error', { message: 'Failed to join channel' })
      }
    })

    socket.on('channel:leave', async (data: { channelId: number }) => {
      try {
        // Validate channelId
        if (!data.channelId || isNaN(data.channelId) || !Number.isInteger(data.channelId)) {
          console.error(`${user.nickname} tried to leave invalid channel:`, data.channelId)
          socket.emit('error', { message: 'Invalid channel ID' })
          return
        }

        socket.leave(`channel:${data.channelId}`)
        console.log(`${user.nickname} left channel:${data.channelId}`)

        this.io.to(`channel:${data.channelId}`).emit('user:left-channel', {
          userId: user.id,
          nickname: user.nickname,
          channelId: data.channelId,
        })
      } catch (error) {
        console.error('Error in channel:leave:', error)
        socket.emit('error', { message: 'Failed to leave channel' })
      }
    })

    // Note: channel:create, channel:delete, channel:invite, channel:kick
    // are handled via HTTP API (ChannelsController), not WebSocket
  }

  private handleMessageEvents(_socket: any) {
    // Note: message:send and message:load-history
    // are handled via HTTP API (ChatsController), not WebSocket
    // WebSocket is only used for broadcasting notifications
  }

  private handleTypingEvents(socket: any) {
    const user = socket.data.user

    // User started typing
    socket.on('user:typing', (data: { channelId: number; text?: string }) => {
      socket.to(`channel:${data.channelId}`).emit('user:typing', {
        userId: user.id,
        nickname: user.nickname,
        channelId: data.channelId,
        text: data.text || '',
      })
    })

    // User stopped typing
    socket.on('user:stopped-typing', (data: { channelId: number }) => {
      socket.to(`channel:${data.channelId}`).emit('user:stopped-typing', {
        userId: user.id,
        nickname: user.nickname,
        channelId: data.channelId,
      })
    })
  }

  private handleUserEvents(socket: any) {
    const user = socket.data.user

    // Update user status
    socket.on('user:status-update', async (data: { status: 'online' | 'dnd' | 'offline' }) => {
      try {
        user.status = data.status
        await user.save()

        // Broadcast status change to all users
        this.io.emit('user:status-changed', {
          userId: user.id,
          nickname: user.nickname,
          status: data.status,
        })
      } catch (error) {
        socket.emit('error', { message: 'Failed to update status' })
      }
    })
  }

  async broadcastMessage(channelId: number, message: any) {
    const channel = await Channel.query().where('id', channelId)
      .preload('userChannels', (query) => {
        query.preload('user')
      }). first()

    if (!channel) {
      return
    }

    for (const userChannel of channel.userChannels) {
      const member = userChannel.user
      const socketIds = this.userSockets.get(member.id)

      if (!socketIds || socketIds.size === 0) {
        continue
      }

      if (member.status === 'offline') {
        continue
      }

      if (member.status === 'dnd') {
        const isMentioned = message.mentionedUserIds?.includes(member.id)

        if (member.notifyOnMentionOnly && !isMentioned) {
          continue
        }

        // Send to all user's connected sockets
        socketIds.forEach((socketId) => {
          this.io.to(socketId).emit('message:new:silent', message)
        })
        continue
      }

      // Send to all user's connected sockets
      socketIds.forEach((socketId) => {
        this.io.to(socketId).emit('message:new', message)
      })
    }
  }

  broadcastChannelCreated(channel: any, members: number[]) {
    members.forEach((userId) => {
      const socketIds = this.userSockets.get(userId)
      if (socketIds) {
        socketIds.forEach((socketId) => {
          this.io.to(socketId).emit('channel:created', channel)
        })
      }
    })
  }

  broadcastChannelDeleted(channelId: number) {
    this.io.to(`channel:${channelId}`).emit('channel:deleted', { channelId })
  }

  broadcastUserStatusChange(userId: number, status: string) {
    this.io.emit('user:status-changed', {
      userId,
      status,
    })
  }

  sendInvite(userId: number, invite: any) {
    const socketIds = this.userSockets.get(userId)
    if (socketIds) {
      socketIds.forEach((socketId) => {
        this.io.to(socketId).emit('channel:invite', invite)
      })
    }
  }

  notifyKick(userId: number, data: any) {
    const socketIds = this.userSockets.get(userId)
    if (socketIds) {
      socketIds.forEach((socketId) => {
        this.io.to(socketId).emit('channel:kick', data)
      })
    }
  }

  notifyRevoke(userId: number, data: any) {
    const socketIds = this.userSockets.get(userId)
    if (socketIds) {
      socketIds.forEach((socketId) => {
        this.io.to(socketId).emit('channel:revoke', data)
      })
    }
  }

  sendChannelMembers(socketId: string, members: any[]) {
    this.io.to(socketId).emit('channel:members', members)
  }

  sendMessageHistory(socketId: string, messages: any[]) {
    this.io.to(socketId).emit('message:history', messages)
  }

  getIO(): SocketIOServer {
    return this.io
  }

  /**
   * Get the cleanup service instance
   */
  getCleanupService(): ChannelCleanupService {
    return this.cleanupService
  }

  /**
   * Stop the socket service and cleanup service
   */
  stop() {
    this.cleanupService.stop()
    this.io.close()
  }
}
