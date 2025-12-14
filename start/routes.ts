import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const ChatsController = () => import('#controllers/chats_controller')
const AuthController = () => import('#controllers/auth_controller')
const ChannelsController = () => import('#controllers/channels_controller')
const InvitesController = () => import('#controllers/invites_controller')
const AdminController = () => import('#controllers/admin_controller')
const UsersController = () => import('#controllers/users_controller')
const NotificationsController = () => import('#controllers/notifications_controller')

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
  }).prefix('/api/auth')

router.group(() => {
    router.post('/messages', [ChatsController, 'sendMessage'])
    router.get('/channels/:id/messages', [ChatsController, 'getMessages'])
  }).prefix('/api').use(middleware.auth())

// Channel commands
router.group(() => {
  router.get('/channels', [ChannelsController, 'index'])
  router.post('/channels', [ChannelsController, 'create'])
  router.post('/channels/join', [ChannelsController, 'join'])
  router.delete('/channels/:id', [ChannelsController, 'destroy'])
  router.post('/channels/:id/invite', [ChannelsController, 'invite'])
  router.post('/channels/:id/kick', [ChannelsController, 'kick'])
  router.post('/channels/:id/revoke', [ChannelsController, 'revoke'])
  router.post('/channels/:id/leave', [ChannelsController, 'leave'])
  router.get('/channels/:id/members', [ChannelsController, 'members'])
}).prefix('/api').use(middleware.auth())

// Invites
router.group(() => {
  router.get('/invites', [InvitesController, 'index'])
  router.post('/invites/:id/accept', [InvitesController, 'accept'])
  router.post('/invites/:id/reject', [InvitesController, 'reject'])
}).prefix('/api').use(middleware.auth())

router.group(() => {
  router.put('/users/status', [UsersController, 'updateStatus'])
  router.put('/users/settings', [UsersController, 'updateSettings'])
  router.get('/users/:id', [UsersController, 'show'])
}).prefix('/api').use(middleware.auth())

router.group(() => {
  router.get('/notifications', [NotificationsController, 'index'])
  router.put('/notifications/read-all', [NotificationsController, 'markAllAsRead'])
  router.put('/notifications/:id/read', [NotificationsController, 'markAsRead'])
  router.delete('/notifications/:id', [NotificationsController, 'destroy'])
}).prefix('/api').use(middleware.auth())

// Admin (testing/debugging)
router.group(() => {
  router.post('/admin/cleanup', [AdminController, 'triggerCleanup'])
}).prefix('/api').use(middleware.auth())
