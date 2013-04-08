/*

hemisphere =
  0: North
  1: South
moveid =
  1: place mine
  2: up
  3: down
  4: left
  5: right
grid = (bitmasks)
  blank: normal
  2^0: has winter trap
  2^1: has spring trap
  2^2: has summer trap
  2^3: has fall trap
  2^6: has stone

to do:
  -fix timeout ?
  -put new images for glow
  -increase season time
  -change who traps damage
*/

var SETTINGS = {}
SETTINGS.x_len = 12
SETTINGS.y_len = SETTINGS.x_len
SETTINGS.move_delay = 100
SETTINGS.disconnect_delay = 60000
SETTINGS.mine_delay = 200
SETTINGS.redraw_delay = 50
SETTINGS.seasontime = 2000
SETTINGS.first_season_fraction = 1 / 4
SETTINGS.start_col = Math.floor(SETTINGS.x_len / 2)
SETTINGS.start_row_N = 0
SETTINGS.start_row_S = SETTINGS.y_len - 1
SETTINGS.clear_interval = 10000
SETTINGS.x_wrap_around = true
SETTINGS.y_wrap_around = false
SETTINGS.publish_shared = 200
SETTINGS.stone_prob = 0.25
SETTINGS.box_size = 800 / SETTINGS.x_len
SETTINGS.random_mine_prob = 0.1


function ndef(x) {
  return (x === undefined) || _.isNaN(x)
}

Item = function (doc) {
  _.extend(this, doc);
};
_.extend(Item.prototype, {
  return_val: function () {
    return this.val;
  }
});

Board = new Meteor.Collection("Board", {
  transform: function (doc) { return new Item(doc); }
});

function idx(i, j) {
  return j * SETTINGS.x_len + i
}

function idx_i(val) {
  return val % SETTINGS.x_len
}

function idx_j(val) {
  return Math.floor(val / SETTINGS.x_len)
}

function insert_board(i, j, val) {
  Board.remove({loc: idx(i, j)})
  Board.insert({loc: idx(i, j), val: val})
}

function set_board(i, j, val) {
  Board.update({loc: idx(i, j)}, {$set: {val: val}})
}

function set_board2(loc, val) {
  set_board(idx_i(loc), idx_j(loc), val)
}


function get_board(i, j) {
  var tmp = Board.findOne({loc: idx(i,j)})
  if (!ndef(tmp)) {
    return tmp.return_val()
  }
}

function get_board2(loc) {
  return get_board(idx_i(loc), idx_j(loc))
}

function apply_all_board(func) {
  Board.find().forEach(function (board) {
    func(board)
  })
}

function clear_board() {
  apply_all_board(function (board) {
    Board.remove(board)
  })
}

Players = new Meteor.Collection("Players", {
  transform: function (doc) { return new Item(doc); }
});

function insert_player(userid, i, j, hemisphere) {
  Players.remove({userid: userid})
  Players.insert({userid: userid, val: idx(i, j), hemisphere: hemisphere})
}

function set_player(userid, i, j) {
  Players.update({userid: userid}, {$set: {val: idx(i, j)}})
}

function get_player(userid) {
  var tmp = Players.findOne({userid: userid})
  if (!ndef(tmp)) {
    return tmp.return_val()
  }
}

function apply_all_players(func) {
  Players.find().forEach(function (player) {
    func(player)
  })
}

function clear_players() {
  apply_all_players(function (player) {
    Players.remove(player)
  })
}

Shared = new Meteor.Collection("Shared", {
  transform: function (doc) { return new Item(doc); }
});

function insert_shared(key, val) {
  Shared.remove({key: key})
  Shared.insert({key: key, val: val})
}

function set_shared(key, val) {
  Shared.update({key: key}, {$set: {val: val}})
}

function get_shared(key) {
  var tmp = Shared.findOne({key: key})
  if (!ndef(tmp)) {
    return tmp.return_val()
  }
}

function apply_all_shared(func) {
  Shared.find().forEach(function (item) {
    func(item)
  })
}


function clear_shared() {
  apply_all_shared(function (item) {
    Shared.remove(item)
  })
}

function start() {
  SETTINGS.north_score = 0
  SETTINGS.south_score = 0
  insert_shared('n_score', 0)
  insert_shared('s_score', 0)
}

function restart() {
  clear_board()
  clear_players()
  // clear_shared()
  for (var i = 0; i < SETTINGS.x_len; i++) {
    for (var j = 0; j < SETTINGS.y_len; j++) {
      insert_board(i, j, 0)
      // if (i !== SETTINGS.start_col && j !== SETTINGS.start_row_N && j !== SETTINGS.start_row_S) {
      if (i !== 0 && i+1 !== SETTINGS.x_len && j !== 0 && j+1 !== SETTINGS.y_len) {
        if (Math.random() < SETTINGS.stone_prob) {
          set_board(i, j, (1 << 6))
        }
      }
    }
  }
  SETTINGS.north_pole_loc = idx(SETTINGS.start_col, SETTINGS.start_row_N)
  SETTINGS.south_pole_loc = idx(SETTINGS.start_col, SETTINGS.start_row_S)
  SETTINGS.north_pole_player = undefined
  SETTINGS.south_pole_player = undefined
  insert_shared('time', 0)
  insert_shared('n_pole', SETTINGS.north_pole_loc)
  insert_shared('s_pole', SETTINGS.south_pole_loc)
}

function console_board() {
  for (var j = 0; j < SETTINGS.y_len; j++) {
    var tmp = ""
    for (var i = 0; i < SETTINGS.x_len; i++) {
      tmp += get_board(i, j) + ' '
    }
    console.log(tmp)
  }
  console.log()
}

function initialize_player(userid, hemisphere) {
  insert_player(userid, SETTINGS.start_col,
      (hemisphere) ?
      SETTINGS.start_row_S :
      SETTINGS.start_row_N,
      hemisphere)
}

function place_mine(userid, season) {
  var loc = get_player(userid)
  var current_grid  = get_board2(loc)
  set_board2(loc, current_grid | (1 << season))
}

function has_bitmask(grid_val, power) {
  return Boolean(grid_val & (1 << power))
}

function cant_move(grid_val) {return has_bitmask(grid_val, 6)}

function dies(grid_val, season) {return has_bitmask(grid_val, (season + 1) % 4)}

function try_to_get_pole(userid, hemisphere, loc) {
  if (hemisphere === 0 && SETTINGS.south_pole_loc === loc && ndef(SETTINGS.south_pole_player)) {
    SETTINGS.south_pole_player = userid
  }
  if (hemisphere === 1 && SETTINGS.north_pole_loc === loc && ndef(SETTINGS.north_pole_player)) {
    SETTINGS.north_pole_player = userid
  }
}

function try_to_move_pole(userid, loc) {
  if (SETTINGS.south_pole_player === userid) {
    SETTINGS.south_pole_loc = loc
  }
  if (SETTINGS.north_pole_player === userid) {
    SETTINGS.north_pole_loc = loc
  }
}

function try_to_drop_pole(userid) {
  if (SETTINGS.south_pole_player === userid) {
    SETTINGS.south_pole_player = undefined
  }
  if (SETTINGS.north_pole_player === userid) {
    SETTINGS.north_pole_player = undefined
  }
}

function try_to_win() {
  var win = false
  if (idx_j(SETTINGS.north_pole_loc) > ((SETTINGS.y_len - 1)/ 2)) {
    win = true
    SETTINGS.south_score += 1
    SETTINGS.north_pole_loc = idx(SETTINGS.start_col, SETTINGS.start_row_N)
    SETTINGS.north_pole_player = undefined
  }
  if (idx_j(SETTINGS.south_pole_loc) < ((SETTINGS.y_len - 1) / 2)) {
    win = true
    SETTINGS.north_score += 1
    SETTINGS.south_pole_loc = idx(SETTINGS.start_col, SETTINGS.start_row_S)
    SETTINGS.south_pole_player = undefined
  }
  return win
}

function move_player(userid, moveid, season, hemisphere) { // returns true if player should be killed
  var loc = get_player(userid)
  if (ndef(loc)) {
    return true
  }
  var i = idx_i(loc)
  var j = idx_j(loc)
  var x_change = 0
  var y_change = 0
  switch (moveid) {
    case 2: y_change = -1; break;
    case 3: y_change = 1; break;
    case 4: x_change = -1; break;
    case 5: x_change = 1; break;
  }

  if (SETTINGS.x_wrap_around) {
    i = (i + x_change + SETTINGS.x_len) % SETTINGS.x_len
  }
  else {
    i = Math.min(Math.max(0, i + x_change), SETTINGS.x_len - 1)
  }

  if (SETTINGS.y_wrap_around) {
    j = (j + y_change + SETTINGS.y_len) % SETTINGS.y_len
  }
  else {
    j = Math.min(Math.max(0, j + y_change), SETTINGS.y_len - 1)
  }

  var grid_val = get_board(i, j)

  if (cant_move(grid_val)) {
    return false
  }
  if (dies(grid_val, season)) {
    set_board(i, j, 0)
    return true
  }
  set_player(userid, i, j)
  if (Math.random() < SETTINGS.random_mine_prob)
    place_mine(userid, season)
  try_to_get_pole(userid, hemisphere, idx(i, j))
  try_to_move_pole(userid, idx(i, j))

  return try_to_win()
}

function remove_player(userid) {
  Players.remove({userid: userid})
  try_to_drop_pole(userid)
}


if (Meteor.isClient) {

  window.onload = function() {
  var userid = Math.random()
  var hemisphere = 0 + (Math.random() > 0.5)

  function read_season_float(hemisphere) {
    return (get_shared('time') + 2 * hemisphere) % 4
  }

  function read_n_pole() { return get_shared('n_pole') }
  function read_s_pole() { return get_shared('s_pole') }
  function read_n_score() { return get_shared('n_score') }
  function read_s_score() { return get_shared('s_score') }

  document.onkeydown = function (evt) {
    evt = evt || window.event;
    var moveid, call_restart;
    switch (evt.keyCode) {
        case 32: moveid = 1; break; // alert("space"); break;
        case 38: moveid = 2; break; // alert("up"); break;
        case 40: moveid = 3; break; // alert("down"); break;
        case 37: moveid = 4; break; // alert("left"); break;
        case 39: moveid = 5; break; // alert("right"); break;
        // case 82:Meteor.call('manual_restart'); break; // r key
    }
    if (!ndef(moveid)) {
      Meteor.call('player_move', userid, moveid, hemisphere)
      var loc = get_player(userid)
      console_board()
      console.log(idx_i(loc))
      console.log(idx_j(loc))
    }
  }

  var ctx = $('#canvas')[0].getContext("2d"); //get a reference to the canvas
  var timer_x = SETTINGS.x_len*SETTINGS.box_size;

  var background = new Image();
  background.src = 'images/grass_tile.png'; // Set source path
  var rockImage = new Image();
  rockImage.src = 'images/rock_tile.png'; // Set source path
  var northPoleImage = new Image();
  northPoleImage.src = 'images/pole_north.png';
  var southPoleImage = new Image();
  southPoleImage.src = 'images/pole_south.png';
  var glow = new Image();
  glow.src = 'images/player_glow3.png';
  // glow.src = 'images/player_death_glow.png';
  var LargeBackground = new Image();
  LargeBackground.src = 'images/whole_background.png';
  var title_picture = new Image();
  title_picture.onload = function () {
    // body...
      ctx.drawImage(title_picture,SETTINGS.box_size*SETTINGS.x_len+80,0);
  }
  title_picture.src = 'images/directions.png';

  var season_names = ["winter", "spring", "summer", "fall"]
  var hemisphere_names = ["north", "south"]
  var traps = []
  var character_sprites = [new Array(), new Array()]
  var character_sprites_images = [new Array(), new Array()]
  var time, time_remaining, img;

  for (var i = 0; i < season_names.length; i++) {
    traps[i] = "images/" + season_names[i] + "_trap.png"
    character_sprites[0][i] = "images/" + hemisphere_names[0] + '_' + season_names[i] + ".png"
    character_sprites[1][i] = "images/" + hemisphere_names[1] + '_' + season_names[i] + ".png"
  }


  var trap_images = new Array();
  img0 = new Image();
  img0.onload = function(){
    trap_images[0]= img0;
  }
  img0.src = traps[0];
  img1 = new Image();
  img1.onload = function(){
    trap_images[1]= img1;
  }
  img1.src = traps[1];
  img2 = new Image();
  img2.onload = function(){
    trap_images[2]= img2;
  }
  img2.src = traps[2];
  img3 = new Image();
  img3.onload = function(){
    trap_images[3]= img3;
  }
  img3.src = traps[3];

  img00 = new Image();
  img00.onload = function(){
    character_sprites_images[0][0] = img00;
  }
  img00.src = character_sprites[0][0];

  img01 = new Image();
  img01.onload = function(){
    character_sprites_images[0][1] = img01;
  }
  img01.src = character_sprites[0][1];

  img02 = new Image();
  img02.onload = function(){
    character_sprites_images[0][2] = img02;
  }
  img02.src = character_sprites[0][2];

  img03 = new Image();
  img03.onload = function(){
    character_sprites_images[0][3] = img03;
  }
  img03.src = character_sprites[0][3];

  img10 = new Image();
  img10.onload = function(){
    character_sprites_images[1][0] = img10;
  }
  img10.src = character_sprites[1][0];

  img11 = new Image();
  img11.onload = function(){
    character_sprites_images[1][1] = img11;
  }
  img11.src = character_sprites[1][1];

  img12 = new Image();
  img12.onload = function(){
    character_sprites_images[1][2] = img12;
  }
  img12.src = character_sprites[1][2];

  img13 = new Image();
  img13.onload = function(){
    character_sprites_images[1][3] = img13;
  }
  img13.src = character_sprites[1][3];

  function draw_grid() {
    for(var i = 0;i<SETTINGS.x_len;i++)
      for(var j = 0;j<SETTINGS.y_len;j++)
          ctx.drawImage(background,SETTINGS.box_size*i,SETTINGS.box_size*j,SETTINGS.box_size,SETTINGS.box_size);
  }

  function draw_score() {
    var score_n = read_n_score()
    score_n = (ndef(score_n)) ? 0 : score_n
    var score_s = read_s_score()
    score_s = (ndef(score_s)) ? 0 : score_s
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    ctx.font="50px Arial";
    ctx.fillText(score_n,SETTINGS.box_size*0.1,SETTINGS.box_size*(SETTINGS.y_len/2+0.5));
    ctx.fillText(score_s,SETTINGS.box_size*(SETTINGS.x_len-1.7),SETTINGS.box_size*SETTINGS.y_len/2);
  }

  function draw_full_grid() {
    ctx.drawImage(LargeBackground,0,0,SETTINGS.box_size*SETTINGS.x_len,SETTINGS.box_size*SETTINGS.y_len);
  }

  function draw_glow() {
    var location = get_player(userid);
    var i = idx_i(location);
    var j = idx_j(location);
    ctx.drawImage(glow,SETTINGS.box_size*i,SETTINGS.box_size*j,SETTINGS.box_size,SETTINGS.box_size);
  }


  function draw_poles()
  {
    var board_piece = read_n_pole();
    var i = idx_i(board_piece);
    var j = idx_j(board_piece);
    ctx.drawImage(northPoleImage,SETTINGS.box_size*i,SETTINGS.box_size*j,SETTINGS.box_size,SETTINGS.box_size);
    board_piece = read_s_pole();
    i = idx_i(board_piece);
    j = idx_j(board_piece);
    ctx.drawImage(southPoleImage,SETTINGS.box_size*i,SETTINGS.box_size*j,SETTINGS.box_size,SETTINGS.box_size);

  }

  function draw_rock_trap(board_piece) {
    var i = idx_i(board_piece.loc)
    var j = idx_j(board_piece.loc)
    if (has_bitmask(board_piece.val, 6)) {
    ctx.drawImage(rockImage,SETTINGS.box_size*i,SETTINGS.box_size*j,SETTINGS.box_size,SETTINGS.box_size);
    }
    else {
      for (var tmp=0; tmp < 4; tmp++)
        if (has_bitmask(board_piece.val, tmp))
          ctx.drawImage(trap_images[tmp],SETTINGS.box_size*i,SETTINGS.box_size*j,SETTINGS.box_size,SETTINGS.box_size);
    }
  }

  function draw_player(player) {
    var player_i = idx_i(player.val)
    var player_j = idx_j(player.val)
    var player_hemisphere = player.hemisphere
    ctx.drawImage(character_sprites_images[player_hemisphere][(Math.floor(time) + 2 * player_hemisphere) % 4],SETTINGS.box_size*player_i,SETTINGS.box_size*player_j,SETTINGS.box_size,SETTINGS.box_size);
    // var img = new Image();
    // img.onload = function(){
    // ctx.drawImage(img,SETTINGS.box_size*player_i,SETTINGS.box_size*player_j,SETTINGS.box_size,SETTINGS.box_size);
    // }
    // img.src=character_sprites[player_hemisphere][(Math.floor(time) + 2 * player_hemisphere) % 4];
  }

  function draw() {
    time = get_shared('time')
    time_remaining = time % 1

    // draw_grid();
    draw_full_grid();
    draw_poles();
    apply_all_board(draw_rock_trap);
    draw_glow();
    apply_all_players(draw_player);
    draw_score();

    ctx.fillStyle = "rgba(255, 255, 0, 1)";
    ctx.clearRect(timer_x,0,40,time_remaining*800);
    ctx.fillRect(timer_x,time_remaining*800,40,800);
  }

  setInterval(draw, SETTINGS.redraw_delay);
  }
}

if (Meteor.isServer) {
  Meteor.startup(function () {

    var start_time = (new Date()).getTime()
    start_time += SETTINGS.first_season_fraction * SETTINGS.seasontime
    var player_times = {}
    var mine_times = {}


    function get_season_float() {
      var t = (new Date()).getTime() - start_time
      return ((t / SETTINGS.seasontime) + 4) % 4
    }

    function get_season(hemisphere) {
      return Math.floor((get_season_float() + 2 * hemisphere) % 4)
    }

    function kill_player(userid) {
      remove_player(userid)
      delete player_times[userid]
    }

    Meteor.methods({
      player_move: function(userid, moveid, hemisphere) {

        var t = (new Date()).getTime()
        var season = get_season(hemisphere)
        // console.log(userid)
        // console.log(moveid)
        // console.log(season)
        if (ndef(player_times[userid])) {
          initialize_player(userid, hemisphere)
          player_times[userid] = 0
          mine_times[userid] = 0
        }
        if (moveid === 1) {
          if (mine_times[userid] + SETTINGS.mine_delay < t) {
            mine_times[userid] = t
            place_mine(userid, season)
          }
        }
        else if (player_times[userid] + SETTINGS.move_delay < t) {
          player_times[userid] = t
          if (move_player(userid, moveid, season, hemisphere)) {
            kill_player(userid)
          }
        }
      },
      manual_restart: function() {
        restart();
      }
    })

    Meteor.setInterval(function () {
        for (player in player_times) {
          if ((new Date()).getTime() - player_times[player] > SETTINGS.disconnect_delay) {
            kill_player(player)
          }
        }
    }, SETTINGS.clear_interval)

    Meteor.setInterval(function () {
      set_shared('time', get_season_float())
      set_shared('n_pole', SETTINGS.north_pole_loc)
      set_shared('s_pole', SETTINGS.south_pole_loc)
      set_shared('n_score', SETTINGS.north_score)
      set_shared('s_score', SETTINGS.south_score)
    }, SETTINGS.publish_shared)

    start()
    restart()
  });
}
