import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notifications'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('channel_id').unsigned().nullable()
      table.foreign('channel_id').references('id').inTable('channels').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['channel_id'])
      table.dropColumn('channel_id')
    })
  }
}