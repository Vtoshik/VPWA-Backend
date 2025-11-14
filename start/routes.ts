import router from '@adonisjs/core/services/router'
import transmit from '@adonisjs/transmit/services/main'
import { middleware } from '#start/kernel'

const ChatsController = () => import('#controllers/chats_controller')
const AuthController = () => import('#controllers/auth_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

transmit.registerRoutes()

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
