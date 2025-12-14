import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Notification from '#models/notification'

export default class AuthController {
  async register({ request, response }: HttpContext) {
    const { email, password, nickname, firstname, lastname } = request.only([
      'email',
      'password',
      'nickname',
      'firstname',
      'lastname',
    ])

    const existingUserByEmail = await User.query().where('email', email).first()
    if (existingUserByEmail) {
      return response.conflict({ message: 'Email already exists' })
    }

    const existingUserByNickname = await User.query().where('nickname', nickname).first()
    if (existingUserByNickname) {
      return response.conflict({ message: 'Nickname already exists' })
    }

    const user = await User.create({
      email,
      password,
      nickname,
      firstname: firstname || null,
      lastname: lastname || null,
      status: 'online',
      notifyOnMentionOnly: false,
    })

    const token = await User.accessTokens.create(user)

    return response.created({
      message: 'User Succesfully created',
      user: user.serialize(),
      token: token.value!.release(),
    })
  }

  async login({ request, response }: HttpContext) {
    const { email, password } = request.only(['email', 'password'])

    try {
      const user = await User.verifyCredentials(email, password)
      const wasOffline = user.status === 'offline'
      user.status = 'online'

      await user.save()
      const token = await User.accessTokens.create(user)

      let unreadNotificationsCount = 0
      if (wasOffline) {
        unreadNotificationsCount = await Notification.query()
          .where('user_id', user.id).where('is_read', false)
          .count('* as total').first().then((result) => result?.$extras.total || 0)
      }

      return response.ok({
        message: 'User successfully logged in',
        user: user.serialize(),
        token: token.value!.release(),
        unreadNotificationsCount,
      })
    } catch (error) {
      return response.unauthorized({ message: 'Invalid email or password' })
    }
  }

  async logout({ auth, response }: HttpContext) {
    const currentUser = auth.user

    if (!currentUser) {
      return response.unauthorized({ message: 'Not authenticated' })
    }

    const token = currentUser.currentAccessToken
    await User.accessTokens.delete(currentUser, token.identifier)

    currentUser.status = 'offline'
    await currentUser.save()

    return response.ok({
      message: 'User successfully logged out',
    })
  }

  async me({ auth, response }: HttpContext) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ message: 'Not Authenticated' })
    }

    return response.ok({
      user: user.serialize(),
    })
  }
}