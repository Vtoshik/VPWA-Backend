import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_channels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable()
      table.integer('channel_id').unsigned().notNullable()
      table.boolean('is_selected').defaultTo(false)

      table.timestamp('joined_at').notNullable()

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('channel_id').references('id').inTable('channels').onDelete('CASCADE')

      table.unique(['user_id', 'channel_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}