/* jshint esnext: true, node: true */
'use strict';

let uuid = require('node-uuid');
let handlebars = require('handlebars');
let fs = require('fs');
let path = require('path');
let pegjs = require('pegjs');

const FILE_PREFIX = 'yasp-';
const NGINX_FILE_PATTERN = /^yasp-([a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12})$/i;

class NginxService {

  constructor(nginxConfig) {

    this._nginxConfig = nginxConfig;

    // Instanciate Nginx configuration parser
    let parserSyntax = fs.readFileSync(nginxConfig.parserSyntax, 'utf8');
    this._parser = pegjs.buildParser(parserSyntax);

    // Load templates
    this._templates = {
      [NginxService.REVERSE_PROXY]: this._loadAndCompileTemplate(nginxConfig.templates.reverseProxy)
    };

  }

  getEntries() {
    return this._getYaspConfigFiles()
      .then(files => {
        let promises = files.map(f => {
          let id = f.match(NGINX_FILE_PATTERN)[1];
          return this._loadConfigFile(f)
            .then(ast => { return { id, ast }; })
          ;
        });
        return Promise.all(promises);
      })
    ;
  }

  saveTemplate(templateName, data, entryId) {
    return new Promise((resolve, reject) => {
      if( !(templateName in this._templates) ) {
        return reject(new Error(`The template "${templateName}" does not exist !`));
      }
      let template = this._templates[templateName];
      let fileContent = template(data);
      return this.saveRawConfig(fileContent, entryId)
        .then(resolve)
        .catch(reject)
      ;
    });
  }

  saveRawConfig(rawConfig, entryId) {
    return new Promise((resolve, reject) => {
      if(!entryId) entryId = uuid.v4();
      let sitesEnabledDir = this._nginxConfig.sitesEnabledDir;
      let filePath = path.join(sitesEnabledDir, FILE_PREFIX+entryId);
      fs.writeFile(filePath, rawConfig, (err) => {
        if(err) return reject(err);
        return resolve(entryId);
      });
    });
  }

  _loadAndCompileTemplate(path) {
    let templateContent = fs.readFileSync(path, 'utf8');
    return handlebars.compile(templateContent);
  }

  _getYaspConfigFiles() {
    return new Promise((resolve, reject) => {
      let sitesEnabledDir = this._nginxConfig.sitesEnabledDir;
      fs.readdir(sitesEnabledDir, (err, files) => {
        if(err) return reject(err);
        return resolve(files.filter(f => NGINX_FILE_PATTERN.test(f)));
      });
    });
  }

  _loadConfigFile(filename) {
    return new Promise((resolve, reject) => {
      let sitesEnabledDir = this._nginxConfig.sitesEnabledDir;
      fs.readFile(path.join(sitesEnabledDir, filename), 'utf8', (err, content) => {
        if(err) return reject(err);
        let ast;
        try {
          ast = this._parser.parse(content);
        } catch(err) {
          return reject(err);
        }
        return resolve(ast);
      });
    });
  }

}

NginxService.REVERSE_PROXY = 'reverse-proxy';

module.exports = NginxService;
