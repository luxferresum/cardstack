const Error = require('@cardstack/plugin-utils/error');
const logger = require('heimdalljs-logger');

class Writers {
  constructor(schemaCache) {
    this.schemaCache = schemaCache;
    this.log = logger('writers');
  }

  async create(branch, user, type, document) {
    this.log.info("creating type=%s", type);
    let schema = await this.schemaCache.schemaForBranch(branch);
    let writer = this._lookupWriter(schema, type);
    let isSchema = schema.constructor.ownTypes().includes(type);
    let pending = await writer.prepareCreate(branch, user, type, document, isSchema);
    await schema.validate(pending, { type });
    let response = await this._finalizeAndReply(pending);
    await this.schemaCache.notifyUpdated(branch, type, response.id, response);
    return response;
  }

  async update(branch, user, type, id, document) {
    this.log.info("updating type=%s id=%s", type, id);
    let schema = await this.schemaCache.schemaForBranch(branch);
    let writer = this._lookupWriter(schema, type);
    let isSchema = schema.constructor.ownTypes().includes(type);
    let pending = await writer.prepareUpdate(branch, user, type, id, document, isSchema);
    await schema.validate(pending, { type, id });
    let response = await this._finalizeAndReply(pending);
    await this.schemaCache.notifyUpdated(branch, type, response.id, response);
    return response;
  }

  async delete(branch, user, version, type, id) {
    this.log.info("deleting type=%s id=%s", type, id);
    let schema = await this.schemaCache.schemaForBranch(branch);
    let writer = this._lookupWriter(schema, type);
    let isSchema = schema.constructor.ownTypes().includes(type);
    let pending = await writer.prepareDelete(branch, user, version, type, id, isSchema);
    await schema.validate(pending, {});
    await pending.finalize();
    await this.schemaCache.notifyUpdated(branch, type, id, null);
  }

  async _finalizeAndReply(pending) {
    let meta = await pending.finalize();
    let finalDocument = pending.finalDocument;
    let responseDocument = {
      id: finalDocument.id,
      type: finalDocument.type,
      meta
    };
    if (finalDocument.attributes) {
      responseDocument.attributes = finalDocument.attributes;
    }
    if (finalDocument.relationships) {
      responseDocument.relationships = finalDocument.relationships;
    }
    return responseDocument;
  }

  _lookupWriter(schema, type) {
    let contentType = schema.types.get(type);
    let writer;
    if (!contentType || !contentType.dataSource || !(writer = contentType.dataSource.writer)) {
      this.log.debug('non-writeable type %s: exists=%s hasDataSource=%s hasWriter=%s', type, !!contentType, !!(contentType && contentType.dataSource), !!writer);

      throw new Error(`"${type}" is not a writable type`, {
        status: 403,
        title: "Not a writable type"
      });
    }
    return writer;
  }
}

module.exports = Writers;