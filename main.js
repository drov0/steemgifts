var express = require('express');
var fs = require('fs');
var sanitize = require("xss");
var bodyParser = require('body-parser');
var Jimp = require("jimp");
var urlencodedParser = bodyParser.urlencoded({ extended: false })
var steem = require('steem');
var nodemailer = require('nodemailer');
var qr = require('qr-image');
var validator = require("email-validator");

var app = express();
app.use(express.static('public'));

steem.api.setOptions({ url: 'wss://steemd-int.steemit.com' });

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

function writeimage(img, output, username, password, steem, callback)
{
    qr.image(password, {
        type: 'png'
    }).pipe(
        require('fs').createWriteStream(__dirname + "/cards/output/"+username+"qr.png")
    );

    Jimp.read(__dirname + "/cards/"+img, function (err, card) {
        if (err) throw err;
        // quick and dirty, TODO : make a good image parser to build automatically the image's text and fonts
        // username
        Jimp.loadFont(__dirname + "/cards/nitesh9/username/Steem-GiftCard-Christmas-Username.fnt").then(function (font) { // load font from .fnt file
            var size = measureText(font, username);
            card.print(font, 905-(size/2), 130, username);

            // password
            Jimp.loadFont(__dirname + "/cards/nitesh9/password/Steem-GiftCard-Christmas-Password.fnt").then(function (font) { // load font from .fnt file
                card.print(font, 496, 652, password);

                // steem
                Jimp.loadFont(__dirname + "/cards/nitesh9/steem/Steem-GiftCard-Christmas-Steem.fnt").then(function (font) { // load font from .fnt file
                    var size = measureText(font, steem);
                    card.print(font, 900-(size/2), 435, steem);

                    Jimp.read(__dirname + "/cards/output/"+username+"qr.png", function (err, qrcode) {
                        card.blit(qrcode, 37, 550);
                        card.quality(100).write(__dirname + "/cards/output/"+output);
                        console.log("Card created")
                        callback();
                    });
                });
            });
        });
    });

}

function validateInput(username,design, steem_nb, log_user, log_activekey, mail,  callback)
{
    error = "";
    var isValidUsername = steem.utils.validateAccountName(username);
    if (isValidUsername != null)
        error += isValidUsername+"<br/>";
    if (isNaN(steem_nb))
        error += "Wrong steem value, you need to set a number.<br/> ";
    if (design != "0" && design != "1")
        error += "Wrong design value, please contact us.<br/>";

    if (!isNaN(steem_nb))
    {
        if (steem_nb < 6)
            error += "You need a minimum of 6 steem to create an account<br/>";
    }

    if (isValidUsername == null) {
        steem.api.getAccounts([username], function (err, result) {
            if (result.length != 0) {
                error += "Chosen username is already taken. Please pick another one <br/>";
            }
        });
    }

    if (!validator.validate(mail))
        error += "Incorrect email address. <br/>"

    steem.api.getAccounts([log_user], function(err, result) {
        if (result.length != 0) {
            var pubWif = result[0].active.key_auths[0][0];
            var valid = false;
            try {
                valid = steem.auth.wifIsValid(log_activekey, pubWif)
            }catch (e){}

            if (!valid)
                error += "Wrong login or active key.<br/>";
            if (result[0].balance < steem_nb)
                error += "You don't have enough steem to gift "+steem_nb+" STEEM. You have "+result[0].balance+"<br/>";

        } else {
            error += "Wrong login or password.<br/>";
        }

        callback(error);

    });
}


function sendmail(to, giftcard_path) {
    //configure mailer

    var auth = fs.readFileSync(__dirname + "/auth").toString();
    var mail_user = auth.substring(0, auth.indexOf(":"))
    var mail_pwd =  auth.substring(auth.indexOf(":")+1)
    const mailOptions = {
        from: mail_user, // sender address
        to: to, // list of receivers
        subject: 'STEEMGIFTS HYPE', // Subject line
        html: '<p>Fredrik stuff here</p>',// plain text body
        attachments: [{   // file on disk as an attachment
            filename: giftcard_path,
            path: __dirname +'/cards/output/'+giftcard_path // stream this file
        }]
    };

    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: mail_user,
            pass: mail_pwd
        }
    });

    transporter.sendMail(mailOptions, function (err, info) {
        if(err)
            console.log(err);

    });

}

app.post('/', urlencodedParser, function (req,res) {
    var username = sanitize(req.body.username);
    var design = "0";//sanitize(req.body.design);
    var steem_nb = sanitize(req.body.steem);
    var password = steem.formatter.createSuggestedPassword();
    var log_user = sanitize(req.body.user);
    var log_activekey = sanitize(req.body.activekey);
    var mail = sanitize(req.body.mail);

    username = username.toLowerCase();

    validateInput(username, design, steem_nb, log_user, log_activekey, mail, function (error) {

    if (error == "") {
        writeimage("nitesh9/Steem-GiftCard-Christmas.png", username+".png", username, password, steem_nb, function() {
            //fs.unlink(__dirname + "/cards/output/"+username+"qr.png");
            sendmail(mail, username + ".png");
        });
        var content = fs.readFileSync(__dirname + "/success.html").toString();
        content = content.replace("##$EMAIL##", mail)
        res.send(content);

    }
    else {
        var content = fs.readFileSync(__dirname + "/main.html").toString();
        content = content.replace("<p class=\"error\"></p>", "<p class=\"error\">"+error+"</p>")
        res.send(content);
    }
    });
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

     steem.broadcast.accountCreate(wif, fee, creator, newAccountName, owner, active, posting, memoKey, jsonMetadata, function(err, result) {
       console.log(err, result);
   });
 */