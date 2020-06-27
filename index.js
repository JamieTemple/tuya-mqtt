const MQTT = require("async-mqtt");
const TuyaDevice = require('tuyapi');
const fs = require('fs');

/**
 * 
 */
const init_devices = async () => {

    config.devices.forEach(async element => {

        var deviceTopic = config.mqtt.root_topic + "/" + element.id + "/";

        var device = new TuyaDevice({
            ip: element.deviceIp,
            id: element.deviceId,
            key: element.deviceKey,
            persistentConnection: true
        });

        device.find().then(() => {
            device.connect();
        });

        device.on('connected', async () => {
            await client.publish(deviceTopic + "status", "connected");
            await client.publish(deviceTopic + "lastseen", (new Date()).toISOString());
        });

        device.on('disconnected', async () => {
            await client.publish(deviceTopic + "status", "disconnected");
            await new Promise(resolve => setTimeout(resolve, 1000));
            await client.publish(deviceTopic + "status", "reconnecting");
            await device.connect();
        });

        device.on('error', async (error) => {
            await client.publish(deviceTopic + "error", JSON.stringify(error));
            await client.publish(deviceTopic + "lastseen", (new Date()).toISOString());
        });

        device.on('heartbeat', async () => {
            await client.publish(deviceTopic + "lastseen", (new Date()).toISOString());
        });

        device.on('data', async (data, commandByte, sequenceN  ) => {
            //console.debug("RECIEVED command: " + commandByte + " - Sequence: " + sequenceN + "  --  " + JSON.stringify(data));
            if (data.dps['1'] != null) {
                await client.publish(deviceTopic + "control", data.dps['1'] ? "ON" : "OFF");
            }
            if (element.currentDps && data.dps[element.currentDps] != null) {
                await client.publish(deviceTopic + "current", data.dps[element.currentDps].toString());
            }
            if (element.powerDps && data.dps[element.powerDps] != null) {
                await client.publish(deviceTopic + "power", (data.dps[element.powerDps] / 10).toString());
            }
            if (element.voltageDps && data.dps[element.voltageDps] != null) {
                await client.publish(deviceTopic + "voltage", (data.dps[element.voltageDps] / 10).toString());
            }
            await client.publish(deviceTopic + "dps", JSON.stringify(data.dps));
            await client.publish(deviceTopic + "lastseen", (new Date()).toISOString());
        });

        client.subscribe(deviceTopic + 'set');
        client.on('message', (t, m) => {
            if (t == deviceTopic + 'set') {
                device.set({ set: (m == "ON" || m == "1") ? true : false });
            }
        })

        await client.publish(deviceTopic + "lastseen", (new Date()).toISOString());
    });
}

/**
 * Handles on connected to broker...
 */
const on_connect = async () => {
    try {
        await client.publish(config.mqtt.root_topic + "/service", "starting");
        await init_devices();
        await client.publish(config.mqtt.root_topic + "/service", "started");
    } catch (e) {
        console.error(e.stack);
        process.exit();
    }
}

/**
 * Want to notify controller that garage is disconnected before shutting down
 */
function handleAppExit(options, err) {
    if (err) {
        console.log(err.stack)
    }

    if (options.cleanup) {
        client.publish(config.mqtt.root_topic + "/service", "stopped")
    }

    if (options.exit) {
        console.log("Terminating");
        process.exit()
    }
}

// -------------------------------------------------------------------------------------------------

var config = JSON.parse(fs.readFileSync("config.json"));

const client = MQTT.connect("tcp://" + config.mqtt.broker_address + ":" + config.mqtt.port, {
    clientId: config.mqtt.clientId,
    username: config.mqtt.username,
    password: config.mqtt.password,
    clean: true
});

client.on("connect", on_connect);

process.on('exit', handleAppExit.bind(null, { cleanup: true }))
process.on('SIGINT', handleAppExit.bind(null, { exit: true }))
process.on('uncaughtException', handleAppExit.bind(null, { exit: true }))