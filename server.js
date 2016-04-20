/**
 * This is the sourcecode for the NodeMC control
 * panel software - it is a web server that runs on a specific
 * port.
 *
 * If you have any questions feel free to ask either on Github or
 * email: gabriel@nodemc.space!
 *
 * (c) Gabriel Simmer 2016
 *
 * Todo:
 * md5sum check for jarfiles
 * File uploading from HTML5 dashboard
 * Self-updater (possible?)
 * Support for other flavours of Minecraft server
 * General dashboard overhaul for sleeker appearence
 *     - Server stats
 *     - Other info on index.html
 *
 * @author Gabriel Simmer <gabreil@nodemc.space>
 * @version 1.0.0
 * @license GPL3
 **/

"use strict";

// Requires
const async             = require("async");
const path              = require("path");
const express           = require("express");
const fs                = require("node-fs");
const crypto            = require("crypto");
const morgan            = require("morgan");
const mkdirp            = require("mkdirp");
const cors              = require("cors");
const FileStreamRotator = require("file-stream-rotator");
const bodyP             = require("body-parser");

// Internal Modules.
const stage     = require("./lib/stage.js");
const Server    = require("./lib/server.js");
const Routes    = require("./lib/express.js");

// config for now.
let config;
try {
  config = require("./config/config.json");
} catch(e) {
  console.error("Failed to read config. This is OK on first run.")
}

// instance the server
let app = new express();

// Instance the Server Object
let server = new Server(config)

async.waterfall([
  /**
   * Stage 0 - Pre-Init
   **/
  (next) => {
    let logger;
    let logDirectory = config.nodemc.logDirectory;

    stage.start(0, "preinit", "INIT");

    // Error Handler
    process.on("exit", () => { // When it exits kill the server process too
      if(server.spawn) server.spawn.kill(2);
    });

    if(server.spawn) {
      server.spawn.on("exit", () => {
        // to do re implement server restart defferel
      });
    }

    // Settup the logger
    fs.exists(logDirectory, exists => {
      if(!exists) {
        let err = mkdirp.sync(logDirectory);

        if(err) {
          return next("Log Directory Doesn\'t exist.");
        }
      }

      let logFile = path.join(logDirectory + "/access-%DATE%.log");
      logger  = FileStreamRotator.getStream({
        filename: logFile,
        frequency: "daily",
        verbose: false,
        date_format: "YYYY-MM-DD"
      });

      stage.finished(0, "preinit", "INIT");
    });

    stage.on("finished", data => {
      if(data.stage === 0) {
        return next(false, logger);
      }
    })
  },

  /**
   * Stage 1 - Express Construction.
   **/
  (logger, next) => {
    stage.start(1, "express::construct", "INIT");

    // middleware
    app.use(cors());

    // static files
    if(config.firstrun) {
      app.use("/", express.static(config.dashboard.setup));
    } else {
      app.use("/", express.static(config.dashboard.dashboard));
    }

    app.use(bodyP.json());
    app.use(bodyP.urlencoded({
        extended: false
    }));
    app.use(morgan("common", {
        stream: logger
    }));

    app.use((req, res, next) => {
      /**
       * Send A API conforment response
       *
       * @param {Anything} data  - data to send.
       *
       * @returns {Res#Send} express res.send
       **/
      res.success = (data) => {
        return res.send({
          success: true,
          data: data
        });
      }

      /**
       * Send A API conforment error.
       *
       * @param {String} message - error message
       * @param {Anything} data  - data to send.
       *
       * @returns {Res#Send} express res.send
       **/
      res.error = (message, data) => {
        return res.send({
          success: false,
          message: message,
          data: data
        })
      }

      return next();
    })

    // Build the Express Routes.
    let routes = new Routes(stage, app, server, function() {
      let args = Array.prototype.slice.call(arguments, 0);
      args[0]  = "main: "+stage.Sub+ " stage "+ stage.Stage + ": " + args[0];
      console.log.apply(console, args);
    });

    stage.on("finished", data => {
      if(data.stage === 1) {
        return next(false, routes);
      }
    })
  },

  /**
   * Stage 2 - Express Launch
   **/
   (routes, next) => {
     routes.start(config.nodemc.port);

     stage.on("finished", data => {
       if(data.stage === 2) {
         return next();
       }
     })
   }
], err => {
  if(err) {
    console.log("Failed to Start! :(")
    console.error(err);
    process.exit(1);
  }

  if (serverOptions && !serverOptions.firstrun) {
    let port   = config.minecraft.port,
        apikey = config.nodemc.apikey;

    // Start then restart server for things to take effect
    //checkVersion();
    console.log("Starting server...");

    server.startServer();
    server.setport(port);
    server.restartserver();

    console.log("Server running at localhost:" + port);
    console.log("API Key: " + apikey);
  }
  console.log("Navigate to http://localhost:" + config.nodemc.port + " to set up NodeMC.");
});
