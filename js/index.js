var chart;
var contestdic = {};
var colorpalette = ['146,186,207', '31,120,180', '178,223,138', '51,160,44', '251,154,153', '227,26,28', '253,191,111', '255,127,0', '202,178,214', '106,61,154', '255,255,153', '177,89,40'];

$(function () {
  $('#load').on('click', Load);
  msgInit();
  var contest = getParam('contest');
  var users = getParam('users');
  if (users) $('#users').val(users);
  $.getJSON(`./contests.json`, function () { })
    .done(function (data) {
      for (var i in data) {
        $('#contest').append(`<option value="${data[i].id}">${data[i].name}</option>`);
        contestdic[data[i].id] = data[i].name;
        if (i == 0 || data[i].id == contest) {
          $('#contest').val(data[i].id);
        }
      }
    })
    .fail(function () {
      alert("Couldn't get the data of contest");
    });

  chart = new Chart($('#chart'), {
    type: 'scatter',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      animation: {
        duration: 0
      },
      scales: {
        x: {
          min: 0,
          ticks: {
            stepSize: 600,
            callback: function (tick) {
              return timeToStr(tick);
            }
          },
          title: {
            display: true,
            text: 'Time',
          }
        },
        y: {
          min: 0,
          ticks: {
            stepSize: 10
          },
          reverse: true,
          title: {
            display: true,
            text: 'Rank',
          }
        }
      },
      layout: {
        padding: {
          left: 20,
          right: 20,
          top: 20,
          bottom: 20
        }
      },
      plugins: {
        title: {
          display: true,
          text: '',
          font: {
            size: 18
          }
        },
        tooltip: {
          mode: 'nearest',
          titleFont: {
            weight: 'bold'
          },
          callbacks: {
            title: function (tis, data) {
              return tis[0].raw.title;
            },
            label: function (ti, data) {
              return `${timeToStr(ti.raw.x)} ${rankToStr(ti.raw.y)}`;
            }
          }
        }
      }
    },
    plugins: [{
      afterDraw: function (c) {
        var ctx = c.ctx;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';;
        c.data.datasets.forEach(function (d, s) {
          var meta = c.getDatasetMeta(s);
          if (!meta.hidden) {
            meta.data.forEach(function (e, i) {
              if (!d.data[i].title) return;
              var text = `${d.data[i].title}:${rankToStr(d.data[i].y)}`;
              var x = e.x;
              var y = e.y - 15;
              var w = ctx.measureText(text).width + 10;
              var h = 22;
              ctx.fillStyle = d.backgroundColor;
              fillRoundRect(ctx, x - w / 2, y - h / 2, w, h, 5);
              ctx.fillStyle = 'rgba(255,255,255,1)';
              ctx.fillText(text, x, y);
            });
          }
        });
      }
    }]
  });
});

function Load() {
  if (/^\w+(,\w+)*$/.test($('#users').val())) {
    var data = { labels: ['0:00'], datasets: [] };
    var contest = $('#contest').val();
    var users = $('#users').val().split(',');
    if (users.length > colorpalette.length) { msgErr('Too many users'); return; }
    $.getJSON(`./data/${contest}.json`, function () { })
      .done(function (jdata) {
        // define variables
        var highest = {};
        for (var i in users) {
          highest[users[i]] = { rank: 0, time: 0 };
        }
        var cainfo = {};
        for (var i in jdata.users) {
          cainfo[jdata.users[i]] = { id: jdata.users[i], point: 0, time: 0, pena: 0 };
        }
        // define functions
        var timeSchedule = function (time) {
          return (time < 600 ? time % 30 : time % 60) == 0;
        }
        var compareStand = function (a, b) {
          if (a.point == b.point) return a.time - b.time;
          return b.point - a.point;
        }
        var calcRank = function (time, newca) {
          data.labels.push(timeToStr(time));
          var standing = [];
          for (var u in jdata.users) {
            standing.push(cainfo[jdata.users[u]]);
          }
          standing.sort(compareStand);
          var rank = 1;
          for (var j = 0; j < standing.length; j++) {
            if (j == 0 || compareStand(standing[j - 1], standing[j]) < 0) rank = j + 1;
            for (var k in users) {
              var u = users[k];
              if (u == standing[j].id) {
                var title = '';
                if (newca[u] && newca[u].length > 0) title = `${newca[u].join(',')}`;
                data.datasets[k].data.push({ title: title, x: time, y: rank });
                if (cainfo[u].point > 0 && (highest[u].rank == 0 || highest[u].rank > rank)) {
                  highest[users[k]] = { rank: rank, time: time, prob: newca[u].join(',') };
                }
              }
            }
          }
        }
        // check users and generate dataset
        for (var i in users) {
          if (!jdata.users.includes(users[i])) {
            msgErr(`Unparticipated User: ${users[i]}`);
            return;
          }
          data.datasets.push({
            label: users[i],
            data: [{ x: 0, y: 1 }],
            borderColor: `rgba(${colorpalette[i]},0.8)`,
            backgroundColor: `rgba(${colorpalette[i]},0.7)`,
            tension: 0.3,
            fill: false,
            showLine: true
          });
        }
        // simulate standings
        var time = 1;
        for (var i in jdata.timeline) {
          for (; time < jdata.timeline[i].time; time++) {
            if (timeSchedule(time)) calcRank(time, {});
          }
          var update = false;
          var newca = {};
          for (var u in users) newca[users[u]] = [];
          for (var j in jdata.timeline[i].data) {
            var d = jdata.timeline[i].data[j];
            cainfo[d.id].point += d.point;
            cainfo[d.id].pena += d.pena;
            cainfo[d.id].time = time + cainfo[d.id].pena * jdata.pena;
            if (users.includes(d.id)) {
              update = true;
              newca[d.id].push(jdata.name[d.prob]);
            }
          }
          if (timeSchedule(time) || update) calcRank(time, newca);
          time++;
        }
        for (; time <= jdata.len; time++) {
          if (timeSchedule(time)) calcRank(time, {});
        }
        chart.data.labels = data.labels;
        chart.data.datasets = data.datasets;
        chart.options.plugins.title.text = contestdic[contest];
        chart.update();
        var sharetext = [];
        for (var i in users) {
          sharetext.push(`${users[i]} : ${rankToStr(highest[users[i]].rank)}(${timeToStr(highest[users[i]].time)},${highest[users[i]].prob})`);
        }
        setTweetButton(
          `${contestdic[contest]} での最高瞬間順位\n${sharetext.join('\n')}`,
          `${contestdic[contest]},OMCReplay`,
          `kuma-tachiren.github.io/OMCReplay?contest=${contest}&users=${users.join(',')}`);
        msgOk('Succeeded');
      })
      .fail(function () {
        msgErr("Couldn't get the data of standings");
      });
  } else {
    msgErr('Invalid User ID(s)')
  }
}

function msgOk(str) {
  msgShow(str, '#008000', '#b0f0b0');
}
function msgErr(str) {
  msgShow('Error: ' + str, '#800000', '#f0b0b0');
}

function msgShow(str, color = '#000000', background = '#b0b0b0') {
  $('#message').css('background-color', background);
  $('#message .text').css('color', color);
  $('#message .text').text(str);
  $('#message .close').css('--color', color);
  $('#message').show();
}

function msgInit() {
  $('.message').hide();
  $('.message input[type=checkbox]').change(function () {
    $(this).parent().parent().hide();
  });
}

function getParam(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, "\\$&");
  var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}

function timeToStr(time) {
  return `${Math.floor(time / 60)}:${('0' + Math.floor(time) % 60).slice(-2)}`;
}

function rankToStr(rank) {
  if (11 <= rank && rank <= 13) return rank + 'th';
  switch (rank % 10) {
    case 1:
      return rank + 'st';
    case 2:
      return rank + 'nd';
    case 3:
      return rank + 'rd';
    default:
      return rank + 'th';
  }
}

function createRoundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, Math.PI * (3 / 2), 0, false);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI * (1 / 2), false);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI * (1 / 2), Math.PI, false);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * (3 / 2), false);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r) {
  createRoundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

function setTweetButton(text, tags, url) {
  $('#share').empty();
  twttr.widgets.createShareButton(
    url,
    document.getElementById("share"),
    {
      size: 'large',
      text: `${text}\n`,
      hashtags: tags
    }
  );
}