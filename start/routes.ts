import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const ChatsController = () => import('#controllers/chats_controller')
const AuthController = () => import('#controllers/auth_controller')
const ChannelsController = () => import('#controllers/channels_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Auth routes
router.group(() => {
    router.post('/register', [AuthController, 'register'])
    router.post('/login', [AuthController, 'login'])
    router.post('/logout', [AuthController, 'logout'])
    router.get('/me', [AuthController, 'me'])
  })
  .prefix('/api/auth')

router.group(() => {
    router.post('/messages', [ChatsController, 'sendMessage'])
    router.get('/channels/:id/messages', [ChatsController, 'getMessages'])
  })
  .prefix('/api')
  .use(middleware.auth())

router.group(() => {
  router.get('/channels', [ChannelsController, 'index'])
  router.post('/channels', [ChannelsController, 'create'])
  router.delete('/channels/:id', [ChannelsController, 'destroy'])
  router.post('/channels/:id/invite', [ChannelsController, 'invite'])
  router.post('/channels/:id/kick', [ChannelsController, 'kick'])
  router.post('/channels/:id/leave', [ChannelsController, 'leave'])
  router.get('/channels/:id/members', [ChannelsController, 'members'])
})
  .prefix('/api')
  .use(middleware.auth())
