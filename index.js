var AWS    = require('aws-sdk')
  , async  = require('async')
  , domain = require('domain');

Array.prototype.flatten = function() {
  return Array.prototype.concat.apply([], this);
};

AWS.config.update({region:'ap-northeast-1'});

var DryRun = process.env.DRY_RUN || false;

exports.handler = function(event, context, callback) {
  var ec2 = new AWS.EC2()
    , d   = domain.create();

  d.on('error', function (err) {
    console.error(err, err.stack);
    return callback(error);
  });

  var succeed = function () {
    callback(null, 'success');
  }

  var getJSTNowDate = function () {
    var offset = 9;
    var d = new Date();
    utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * offset));
  }

  var parseTime = function (timeString) {
    if (null === timeString) {
      return null;
    }

    try {
      var date = getJSTNowDate();
      var time = timeString.match(/(\d+)(?::(\d\d))?\s*(p?)/);
      date.setHours( parseInt(time[1]) + (time[3] ? 12 : 0) );
      date.setMinutes( parseInt(time[2]) || 0 );
      date.setSeconds(0);
      return date;
    } catch (e) {
      console.error('Fail to parse time: ' + timeString);
      return null;
    }
  }

  var getInstanceTag = function (instance, tagName) {
    var tags = instance.Tags.filter(function (tag) {
      return tagName === tag.Key;
    });
    if (1 > tags.length) {
      return null;
    }
    return tags[0].Value;
  }

  ec2.describeInstances({
    DryRun: DryRun,
    Filters: [ { Name: 'tag-key', Values: [ 'PowerOn', 'PowerOff' ] } ]
  }, d.intercept(function (data) {

    var instances = data
    .Reservations
    .map(function (reservation) {
      return reservation.Instances
    })
    .flatten()
    .map(function (instance) {
      var powerOnTagValue  = getInstanceTag(instance, 'PowerOn');
      var powerOffTagValue = getInstanceTag(instance, 'PowerOff');

      return {
        id: instance.InstanceId,
        state: instance.State.Name,
        powerOnDate: parseTime(powerOnTagValue),
        powerOffDate: parseTime(powerOffTagValue)
      }
    }).filter(function (instance) {
      return (instance.scheduleTime !== null);
    });

    if (instances.length === 0) {
      return succeed();
    }

    var now = getJSTNowDate();

    console.log('Instances Having Tag: [' + instances.map(function (instance) {
        return instance.id;
    }) + ']');

    var powerOnTargets = instances.filter(function (instance) {
      if (instance.state !== 'stopped' || null === instance.powerOnDate) {
        return false;
      }

      console.log('[' + instance.id + '] Instance is stopped');
      console.log('[' + instance.id + '] Instance power on date: ' + instance.powerOnDate);
      console.log('Now date is ' + now);

      var willBeLaunched = instance.powerOffDate.getTime() < now.getTime();

      if (null === instance.powerOffDate) {
        willBeLaunched = instance.powerOnDate.getTime() < now.getTime();
      } else {
        willBeLaunched = (instance.powerOnDate.getTime() < now.getTime()) && (instance.powerOffDate.getTime() > now.getTime());
      }

      console.log('[' + instance.id + '] Instance will be launched: ' + willBeLaunched);

      return willBeLaunched;
    }).map(function (instance) {
      return instance.id;
    });

    var powerOffTargets = instances.filter(function (instance) {
      if (instance.state !== 'running' || null === instance.powerOffDate) {
        return false;
      }

      console.log('[' + instance.id + '] Instance is running');
      console.log('[' + instance.id + '] Instance power off date: ' + instance.powerOnDate);
      console.log('[' + instance.id + '] Now date is ' + now);

      var willBeStopped = instance.powerOffDate.getTime() < now.getTime();

      console.log('[' + instance.id + '] Instance will be stopped: ' + willBeStopped);

      return willBeStopped;
    }).map(function (instance) {
      return instance.id;
    });

    console.log('Power on  taget\'s instnaces: [' + powerOnTargets  + ']');
    console.log('Power off taget\'s instnaces: [' + powerOffTargets + ']');

    async.parallel([
      function(callback) {
        if (0 === powerOnTargets.length) {
          return callback(null);
        }
        ec2.startInstances({
          DryRun: DryRun,
          InstanceIds: powerOnTargets
        }, callback);
      },
      function(callback) {
        if (0 === powerOffTargets.length) {
          return callback(null);
        }
        ec2.stopInstances({
          DryRun: DryRun,
          InstanceIds: powerOffTargets
        }, callback);
      }
    ], d.intercept(succeed));
  }));
};
