var context = {
  invokeid: 'invokeid',
  done: function (err, message) {
    return;
  },
  succeed: function () {
    return;
  },
  fail: function (error) {
    console.error(error);
    return;
  }
};

var lambda = require("./index");
lambda.handler({}, {}, function (err, message) {
  if (err) {
    return console.error(err);
  }
  console.log(message);
});
