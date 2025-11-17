import { Server as SocketIOServer } from 'socket.io'
import type { Server as HttpServer } from 'http'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'

export default class SocketService {
  private io: SocketIOServer
  private userSockets: Map<number, string> = new Map()

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:9000',
        credentials: true,
      },
    })

    this.setupMiddleware()
    this.setupEventHandlers()
  }

  private setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token as string

        if (!token) {
          return next(new Error('Authentication token required'))
        }

        // Find token in database - token format: "oat_hash"
        const tokenHash = token.replace('oat_', '')
        const accessTokenRecord = await db
          .from('auth_access_tokens')
          .where('hash', tokenHash)
          .first()

        if (!accessTokenRecord) {
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

      this.userSockets.set(user.id, socket.id)
      this.handleChannelEvents(socket)
      this.handleMessageEvents(socket)
      this.handleTypingEvents(socket)
      this.handleUserEvents(socket)

      socket.on('disconnect', () => {
        console.log(`User ${user.nickname} disconnected`)
        this.userSockets.delete(user.id)
      })
    })
  }

  private handleChannelEvents(socket: any) {
    const user = socket.data.user

    socket.on('channel:join', async (data: { channelId: number }) => {
      try {
        socket.join(`channel:${data.channelId}`)
        console.log(`${user.nickname} joined channel:${data.channelId}`)

        this.io.to(`channel:${data.channelId}`).emit('user:joined-channel', {
          userId: user.id,
          nickname: user.nickname,
          channelId: data.channelId,
        })
      } catch (error) {
        socket.emit('error', { message: 'Failed to join channel' })
      }
    })

    socket.on('channel:leave', async (data: { channelId: number }) => {
      try {
        socket.leave(`channel:${data.channelId}`)
        console.log(`${user.nickname} left channel:${data.channelId}`)

        this.io.to(`channel:${data.channelId}`).emit('user:left-channel', {
          userId: user.id,
          nickname: user.nickname,
          channelId: data.channelId,
        })
      } catch (error) {
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

  broadcastMessage(channelId: number, message: any) {
    this.io.to(`channel:${channelId}`).emit('message:new', message)
  }

  broadcastChannelCreated(channel: any, members: number[]) {
    members.forEach((userId) => {
      const socketId = this.userSockets.get(userId)
      if (socketId) {
        this.io.to(socketId).emit('channel:created', channel)
      }
    })
  }

  broadcastChannelDeleted(channelId: number) {
    this.io.to(`channel:${channelId}`).emit('channel:deleted', { channelId })
  }

  sendInvite(userId: number, invite: any) {
    const socketId = this.userSockets.get(userId)
    if (socketId) {
      this.io.to(socketId).emit('channel:invite', invite)
    }
  }

  notifyKick(userId: number, data: any) {
    const socketId = this.userSockets.get(userId)
    if (socketId) {
      this.io.to(socketId).emit('channel:kick', data)
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
}
