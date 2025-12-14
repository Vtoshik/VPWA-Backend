import type { HttpContext } from "@adonisjs/core/http";
import User from "#models/user";
import { getSocketIO } from "#services/socket_provider";
import { messages } from "@vinejs/vine/defaults";
import { stat } from "fs";

export default class UsersController {
    async updateStatus({ request, auth, response }: HttpContext) {
        const user = auth.user;
        if (!user) {
            return response.unauthorized({ message: 'Unauthorized' })
        }

        const { status } = request.only(['status'])
        if (!['online', 'dnd', 'offline'].includes(status)) {
            return response.badRequest({ message: 'Invalid status. Must be: online, dnd, or offline' })
        }

        user.status = status
        await user.save()

        const socketIO = getSocketIO()
        socketIO.broadcastUserStatusChange(user.id, status)

        return response.ok({
            message: 'Status updated successfully',
            user: user.serialize(),
        })
    }

    async updateSettings({ request, auth, response }: HttpContext) {
        const user = auth.user
        if (!user) {
            return response.unauthorized({ message: 'Unauthorized' })
        }

        const { notifyOnMentionOnly } = request.only(['notifyOnMentionOnly'])
        if (typeof notifyOnMentionOnly === 'boolean') {
            user.notifyOnMentionOnly = notifyOnMentionOnly
            await user.save()
        }
    
        return response.ok({
            message: 'Settings updated successfully',
            user: user.serialize(),
        })
    }

    async show({ params, auth, response }: HttpContext ){
        const user = auth.user
        if (!user) {
            return response.unauthorized({ message: 'Unauthorized' })
        }

        const targetUser = await User.find(params.id)
        if (!targetUser) {
            return response.notFound({ message: 'User not found' })
        }
    
        return response.ok({
            user: {
                id: targetUser.id,
                nickname: targetUser.nickname,
                firstname: targetUser.firstname,
                lastname: targetUser.lastname,
                status: targetUser.status,
            },
        })
    }
}