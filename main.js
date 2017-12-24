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

var production = true;

if (production)
    steem.api.setOptions({ url: 'wss://steemd-int.steemit.com' });
else {
    // Testnet :
    steem.api.setOptions({ url: 'wss://testnet.steem.vc',address_prefix:'STX',chain_id: '79276aea5d4877d9a25892eaa01b0adf019d3e5cb12a97478df3298ccdd01673' });
    steem.config.set('websocket','wss://testnet.steem.vc')
    steem.config.set('address_prefix', 'STX')
    steem.config.set('chain_id', '79276aea5d4877d9a25892eaa01b0adf019d3e5cb12a97478df3298ccdd01673')
}


/**
 * Creates an account
 * @param {String} username - username of the new account
 * @param {String} password - password of the new account
 * @param {String} owner_name - Name of the account that will pay the fee (and create the account).
 * @param {String} wif - active key of the account that will pay the fee (and create the account).
 * @param {String} fee - fee for creating the account. Needs to be in the form "X.XXX STEEM" eg : 3.210 STEEM
 * @return {Boolean} success - whether the account creation was successfull or not.
 */
function createAccount(username, password, owner_name, wif,  fee, callback)
{
    var publicKeys = steem.auth.generateKeys(username, password, ['posting', 'owner', 'active', 'memo']);

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


    var jsonMetadata = '';
    var success = false;
    try {
        steem.broadcast.accountCreate(wif, fee, owner_name,
            username, owner, active, posting, publicKeys.memo,
            jsonMetadata, function (err) {
                if (err == null)
                    success = true;
                callback(success)
            });
    } catch(e)    {
        console.log(e)
    }


}

// Main page
app.get('/', function (req, res) {
    res.sendFile(__dirname + "/main.html")
});

// Creation without an account page
app.get('/create', function (req, res) {
    res.sendFile(__dirname + "/create.html")
});

/**
 * Taken from JIMP source code, measures the visual space taken by a text.
 * @param {font} font - Font object from JIMP's loadFont function
 * @param {String} text - Text to measure
 * @return {int} size in pixels
 */
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


/**
 *
 * @param {String} img - Image path using /cards/ as root
 * @param {String} output - Output image name
 * @param {String} username - Username to be written on the card
 * @param {String} password - password to be written on the card
 * @param {String} steem - steem to be written on the card
 */
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
                        card.quality(100).write(__dirname + "/cards/output/"+output, function () {
                            console.log("Card created")
                            callback();
                        });
                    });
                });
            });
        });
    });

}
/**
 * @param {String} username - Username to be written on the card
 * @param {String} design - card design id, unused for now
 * @param {String} steem_nb - Number of steem to be gifted
 * @param {String} log_user - username of the creator account
 * @param {String} log_activekey - Active key of the creator account
 * @param {String} mail - Mail used to send the finished card
 */
function validateInput_account(username, design, steem_nb, log_user, log_activekey, mail, callback)
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
        if (steem_nb < 6)
            error += "You need a minimum of 6 steem to create an account<br/>";

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
            if (!isNaN(steem_nb))
                if (parseFloat(result[0].balance) < parseFloat(steem_nb))
                    error += "You don't have enough steem to gift "+steem_nb+" STEEM. You have "+result[0].balance+"<br/>";

        } else {
            error += "Wrong login or password.<br/>";
        }

        callback(error);

    });
}


/**
 * @param {String} username - Username to be written on the card
 * @param {String} design - card design id, unused for now
 * @param {String} steem_nb - Number of steem to be gifted
 * @param {String} password - Password to be written on the card.
 * @param {String} mail - Mail used to send the finished card
 */
function validateInput_create(username, password, design, steem_nb, mail, callback)
{
    error = "";
    var isValidUsername = steem.utils.validateAccountName(username);
    if (isValidUsername != null)
        error += isValidUsername+"<br/>";
    if (isNaN(steem_nb))
        error += "Wrong steem value, you need to set a number.<br/> ";
    if (design != "0" && design != "1")
        error += "Wrong design value, please contact us.<br/>";

    //TODO : Add some password validation
    if (!validator.validate(mail))
        error += "Incorrect email address. <br/>";
    callback(error);
}



/**
 * @param {String} to - Destination mail
 * @param {String} giftcard_path - card name relative to /cards/output/
 */
function sendmail(to, giftcard_path) {
    //configure mailer

    var auth = fs.readFileSync(__dirname + "/auth").toString();
    var mail_user = auth.substring(0, auth.indexOf(":"))
    var mail_pwd =  auth.substring(auth.indexOf(":")+1)
    const mailOptions = {
        from: mail_user, // sender address
        to: to, // list of receivers
        subject: 'Your steemgifts card', // Subject line
        html: '<p>Thank you for using steemgifts.com to create a unique STEEM gift card for the holidays! We hope it will be a success as a gift and bring some happy new steemians to the growing community. On behalf of the steemgifts team (fredrikaa and howo!) we wish you a merry Christmas and a happy new year. Steem on!<br /> Please find attached your gift card. We highly recommend that you keep the password well hidden and that it is only shared with the person who receives the gift.</p>',// plain text body
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


/**
 * @param {float} num - Number to be analyzedgit
 * @return {int}  number of decimals
 */
function decimalPlaces(num) {
    var match = (''+num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) { return 0; }
    return Math.max(
        0,
        // Number of digits right of decimal point.
        (match[1] ? match[1].length : 0)
        // Adjust for scientific notation.
        - (match[2] ? +match[2] : 0));
}

app.post('/create', urlencodedParser, function (req,res) {
    var username = sanitize(req.body.username);
    var password = sanitize(req.body.password);
    var design = "0";//sanitize(req.body.design);
    var steem_nb = sanitize(req.body.steem);
    var mail = sanitize(req.body.mail);

    username = username.toLowerCase();
    validateInput_create(username, password, design, steem_nb, mail , function (error) {
        if (error === "") {
            writeimage("nitesh9/Steem-GiftCard-Christmas-Double-Sided.png", username + ".png", username, password, steem_nb, function () {
             fs.unlink(__dirname + "/cards/output/"+username+"qr.png");
             sendmail(mail, username + ".png");
             var content = fs.readFileSync(__dirname + "/success.html").toString();
             content = content.replace("##$EMAIL##", mail);
             content = content.replace("on your purchase ", "");
             res.send(content);
             });
        }
        else {
            var content = fs.readFileSync(__dirname + "/main.html").toString();
            content = content.replace("<p class=\"error\"></p>", "<p class=\"error\">" + error + "</p>")
            res.send(content);
        }
    });
});



app.post('/', urlencodedParser, function (req,res) {
    var username = sanitize(req.body.username);
    var design = "0";//sanitize(req.body.design);
    var steem_nb = sanitize(req.body.steem);
    var password = steem.formatter.createSuggestedPassword();
    var log_user = sanitize(req.body.user);
    var log_activekey = sanitize(req.body.activekey);
    var mail = sanitize(req.body.mail);


    username = username.toLowerCase();

    validateInput_account(username, design, steem_nb, log_user, log_activekey, mail, function (error) {

    if (error === "") {

        steem_nb = "" + Math.round(steem_nb * 1000) / 1000;

        var steem_displayed = steem_nb;

        var decimals = decimalPlaces(steem_nb)

        if (decimals === 0)
            steem_nb += ".000 STEEM";
        else if (decimals === 1)
            steem_nb += "00 STEEM";
        else if (decimals === 2)
            steem_nb += "0 STEEM";
        else
            steem_nb += " STEEM"
        createAccount(username, password, log_user, log_activekey, steem_nb, function (success) {
            if (success) {
                writeimage("nitesh9/Steem-GiftCard-Christmas-Double-Sided.png", username + ".png", username, password, steem_displayed, function () {
                    fs.unlink(__dirname + "/cards/output/"+username+"qr.png");
                    sendmail(mail, username + ".png");
                    var content = fs.readFileSync(__dirname + "/success.html").toString();
                    content = content.replace("##$EMAIL##", mail)
                    res.send(content);
                });
            } else {
                var content = fs.readFileSync(__dirname + "/main.html").toString();
                content = content.replace("<p class=\"error\"></p>", "<p style=\"text-transform: none\">" +
                    "There was an error during the creation of your account.<br/> " +
                    "Please look if your steem was sent, if so, the account is : " + username + ":" + password + " . <br/>" +
                    "Contact us for your card.</p>")
                res.send(content);
            }
        });


    }
    else {
        var content = fs.readFileSync(__dirname + "/main.html").toString();
        content = content.replace("<p class=\"error\"></p>", "<p class=\"error\">" + error + "</p>")
        res.send(content);
    }
    });
});


app.listen(8000, function () {
    console.log("Steemgifts is ready to go !")
});


