var express = require('express');
var crypto = require("crypto");
var fs = require('fs');
var cryptoRandomString = require('crypto-random-string');
var sanitize = require("xss");
var bodyParser = require('body-parser');
var Jimp = require("jimp");
var app = express();
app.use(express.static('public'));
var urlencodedParser = bodyParser.urlencoded({ extended: false })
var sc2 = require("sc2-sdk");
var steem = require('steem');

var Asset = require('dsteem').Asset;


app.get('/', function (req, res) {
    res.sendFile(__dirname + "/main.html")
});


function measureText(font, text) {
    var x = 0;
    for (var i = 0; i < text.length; i++) {
        if (font.chars[text[i]]) {
            x += font.chars[text[i]].xoffset
                + (font.kernings[text[i]] && font.kernings[text[i]][text[i+1]] ? font.kernings[text[i]][text[i+1]] : 0)
                + (font.chars[text[i]].xadvance || 0);
        }
    }
    return x;
};

function writeimage(img, username, password, steem)
{
    Jimp.read(__dirname + "/public/cards/"+img, function (err, card) {
        if (err) throw err;
        // quick and dirty, TODO : make a good image parser to build automatically the image's text and fonts
        // username
        Jimp.loadFont(__dirname + "/public/cards/nitesh9/username/Steem-GiftCard-Christmas-Username.fnt").then(function (font) { // load font from .fnt file
            var size = measureText(font, username);
            card.print(font, 905-(size/2), 130, username);

            // password
            Jimp.loadFont(__dirname + "/public/cards/nitesh9/password/Steem-GiftCard-Christmas-Password.fnt").then(function (font) { // load font from .fnt file
                card.print(font, 496, 653, password);

                // steem
                Jimp.loadFont(__dirname + "/public/cards/nitesh9/steem/Steem-GiftCard-Christmas-Steem.fnt").then(function (font) { // load font from .fnt file
                    var size = measureText(font, steem);
                    card.print(font, 900-(size/2), 435, steem);
                    card.quality(100).write(__dirname + "/public/cards/done.jpg");
                    console.log("Card created")
                });
            });
        });
    });

}

function validateInput(username,design, steem_nb)
{
    error = "";
    var isValidUsername = steem.utils.validateAccountName(username);
    if (isValidUsername != 'null')
        error += isValidUsername;
    if (isNaN(steem_nb))
        error += "Wrong steem value, you need to set a number.<br/> ";
    if (design != "0" && design != "1")
        error += "Wrong design value, please contact us.<br/>";

    if (!isNaN(steem_nb))
    {
        if (steem_nb < 6)
        {
            error += "You need a minimum of 6 steem to create an account<br/>";
        }
    }
    return error;
}


app.post('/', urlencodedParser, function (req,res) {
    var username = sanitize(req.body.username);
    var design = "0";//sanitize(req.body.design);
    var steem_nb = sanitize(req.body.steem);
    var password = steem.formatter.createSuggestedPassword();

    username = username.toLowerCase();

    error = validateInput(username, design, steem_nb);

    if (error == "null") {
        writeimage("nitesh9/Steem-GiftCard-Christmas.png", username, password, steem_nb);
    }
    else {
        var content = fs.readFileSync(__dirname + "/main.html").toString();
        content = content.replace("<p class=\"error\"></p>", "<p class=\"error\">"+error+"</p>")
        res.send(content);
    }

   /* steem.broadcast.accountCreate(wif, fee, creator, newAccountName, owner, active, posting, memoKey, jsonMetadata, function(err, result) {
        console.log(err, result);
    });*/

    //res.sendFile(__dirname + "/main.html")
});


app.listen(8000, function () {
    console.log("Steemgifts is ready to go !")
});


/*

var wif = steem.auth.toWif("howo", "", 'active');

    var publicKeys = steem.auth.generateKeys("BUumcSh4Cm", "barman1", ['posting', 'owner', 'active', 'memo']);

    var owner = {
        weight_threshold: 1,
        account_auths: [],
        key_auths: [[publicKeys.owner, 1]]
    };
    var active = {
        weight_threshold: 1,
        account_auths: [],
        key_auths: [[publicKeys.active, 1]]
    };
    var posting = {
        weight_threshold: 1,
        account_auths: [],
        key_auths: [[publicKeys.posting, 1]]
    };

    steem.api.getConfig(function(err, config) {
        if(err){
            console.log(err, config);
            throw new Error(err);
        }

        steem.api.getChainProperties(function(err2, chainProps) {
            if(err2){
                console.log(err2, chainProps);
                throw new Error(err2);
            }

            var ratio = config['STEEMIT_CREATE_ACCOUNT_WITH_STEEM_MODIFIER'];
            var fee = Asset.from(chainProps.account_creation_fee).multiply(ratio);

            var feeString = fee.toString();
            var jsonMetadata = '';

            steem.broadcast.accountCreate(wif, feeString, "howo",
                "howo1",owner , active, posting, publicKeys.memo,
                jsonMetadata, function(err, result) {
                    console.log(err, result);
                });
        });
    });
 */