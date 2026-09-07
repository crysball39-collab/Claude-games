/* Wall tile glyphs traced pixel-for-pixel from a 1x pixel-perfect capture of
   the 1980 arcade screen. Each glyph is one 8x8 tile, eight bytes, one byte
   per row, bit 7 = leftmost pixel. TILEMAP indexes them in base 36. */
(function (global) {
  'use strict';
  var GLYPH_HEX = [
    '0f30404788909090', 'ff0000ff00000000', 'ff0000e010080808', 'ff00000708101010',
    'f00c02e211090909', '9090909090909090', '0000000000000000', '0808080808080808',
    '1010101010101010', '0909090909090909', '0000000003040808', '00000000ff000000',
    '00000000c0201010', '0808040300000000', '000000ff00000000', '101020c000000000',
    '000000e010080808', '0000000708101010', '909090884740300f', '00000000ff0000ff',
    '1010100807000000', '08080810e0000000', '09090911e2020cf0', '000000000f080809',
    '00000000ff0101ff', '00000000ff8080ff', '00000000f0101090', '0908080f00000000',
    '901010f000000000', '9090908887808080', '09090911e1010101', '8080808788909090',
    '010101e111090909'
  ];
  var TILEMAP = [
    '0111111111111231111111111114',
    '5666666666666786666666666669',
    '56abbc6abbbc6786abbbc6abbc69',
    '5676686766686786766686766869',
    '56deef6deeef6df6deeef6deef69',
    '5666666666666666666666666669',
    '56abbc6ac6abbbbbbc6ac6abbc69',
    '56deef6786deegheef6786deef69',
    '5666666786666786666786666669',
    'ijjjjc67kbbc6786abbl86ajjjjm',
    '66666567heef6df6deeg86966666',
    '6666656786666666666786966666',
    '6666656786njo66pjq6786966666',
    '11111f6df6966666656df6d11111',
    '6666666666966666656666666666',
    'jjjjjc6ac6966666656ac6ajjjjj',
    '6666656786r111111s6786966666',
    '6666656786666666666786966666',
    '6666656786abbbbbbc6786966666',
    '01111f6df6deegheef6df6d11114',
    '5666666666666786666666666669',
    '56abbc6abbbc6786abbbc6abbc69',
    '56deg86deeef6df6deeef67hef69',
    '5666786666666666666666786669',
    'tbc6786ac6abbbbbbc6ac6786abu',
    'vef6df6786deegheef6786df6dew',
    '5666666786666786666786666669',
    '56abbbblkbbc6786abblkbbbbc69',
    '56deeeeeeeef6df6deeeeeeeef69',
    '5666666666666666666666666669',
    'ijjjjjjjjjjjjjjjjjjjjjjjjjjm'
  ];

  var DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
  var glyphs = GLYPH_HEX.map(function (hex) {
    var rows = [];
    for (var i = 0; i < 8; i++) rows.push(parseInt(hex.substr(i * 2, 2), 16));
    return rows;
  });

  /** Paint every wall pixel of the maze in `color` onto `ctx` (maze-local). */
  function paint(ctx, color) {
    ctx.fillStyle = color;
    for (var r = 0; r < TILEMAP.length; r++) {
      var row = TILEMAP[r];
      for (var c = 0; c < row.length; c++) {
        var g = glyphs[DIGITS.indexOf(row[c])];
        for (var y = 0; y < 8; y++) {
          var bits = g[y];
          if (!bits) continue;
          var run = -1;
          for (var x = 0; x < 9; x++) {
            var on = x < 8 && (bits & (1 << (7 - x)));
            if (on && run < 0) run = x;
            else if (!on && run >= 0) {
              ctx.fillRect(c * 8 + run, r * 8 + y, x - run, 1);
              run = -1;
            }
          }
        }
      }
    }
  }

  global.MazeTiles = { paint: paint, glyphs: glyphs, tilemap: TILEMAP };
})(window);
