import type { HttpContext } from "@adonisjs/core/http";
import Notification from "#models/notification";

export default class NotificationsController {
    async index({ auth, response, request }: HttpContext) {
        const user = auth.user;
        if (!user) {
            return response.unauthorized({ message: 'Unauthorized'})
        }

        const page = request.input('page', 1)
        const limit = request.input('limit', 50)
        const unreadOnly = request.input('unreadOnly', true)
        const query = Notification.query().where('user_id', user.id)
            .preload('message', (messageQuery) => {
                messageQuery.preload('user').preload('channel')
            }).orderBy('created_at', 'desc')
            
        if (unreadOnly) {
            query.where('is_read', false)
        }

        const notificationsPagination = await query.paginate(page, limit)
        const notifications = notificationsPagination.all()
        const serializedNotifications = notifications.map((notification) => 
            ({
                id : notification.id,
                type: notification.type,
                isRead: notification.isRead,
                createdAt: notification.createdAt.toISO(),
                message: notification.message ? {
                    id: notification.message.id,
                    text: notification.message.text,
                    sendAt: notification.message.sendAt.toISO(),
                    user: notification.message.user ? {
                        id: notification.message.user.id,
                        nickname: notification.message.user.nickname,
                    } : null,
                    channel: notification.message.channel ? {
                        id: notification.message.channel.id,
                        name: notification.message.channel.name,
                    } : null,
                } : null
        }))

        return response.ok({
            data: serializedNotifications,
            meta: notificationsPagination.getMeta(),
        })
    }

    async markAsRead({ params, auth, response }: HttpContext ) {
        const user = auth.user
        if (!user) {
            return response.unauthorized({ message: 'Unauthorized' })
        }

        const notification = await Notification.query()
            .where('id', params.id).where('user_id', user.id).first()

        if (!notification) {
            return response.notFound({ message: 'Notification not found' })
        }

        notification.isRead = true
        await notification.save()

        return response.ok({ message: 'Notification marked as read' })
    }

    async markAllAsRead({ auth, response }: HttpContext) {
        const user = auth.user
        if (!user) {
            return response.unauthorized({ message: 'Unauthorized' })
        }

        await Notification.query().where('user_id', user.id)
            .where('is_read', false).update({ is_read: true })

        return response.ok({ message: 'All notifications marked as read' })
    }

    async destroy({ params, auth, response }: HttpContext) {
        const user = auth.user
        if (!user) {
            return response.unauthorized({ message: 'Unauthorized' })
        }

        const notification = await Notification.query()
            .where('id', params.id).where('user_id', user.id)
            .first()

        if (!notification) {
            return response.notFound({ message: 'Notification not found' })
        }

        await notification.delete()

        return response.ok({ message: 'Notification deleted' })
    }
}