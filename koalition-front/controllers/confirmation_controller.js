const { body,validationResult } = require('express-validator/check');
const { sanitizeBody } = require('express-validator/filter');
var jwt = require('jsonwebtoken');

function  execute_get(req,res) {
            var token = jwt.sign({ "source": "jointhekoalition"}, res.app.get("secrets").jwt_secret, {
                expiresIn: 7200 // expires in 2 hours
            });
            res.render('confirm',
                // return translations plus JWT token
                Object.assign(req.app.get("translation").get(req.params.lang),{"token":token})
            );    
         };
        
function  execute_post(req,res) {
            
            var token = req.headers['x-auth'];
            if (!token) return send_error(res,"No token provided",401);
            
            jwt.verify(token, res.app.get("secrets").jwt_secret, function(err, decoded) {
                if (err) return send_error(res,"Token expired, please refresh the page",505);   
                parse_intput(req,res);
              });
}

function parse_intput(req,res) {

            var body = req.body;
            console.log("POST Authenticated Input received, body: %j",body)

            // input parsing
            var main_record = {
                "Name": body.first_name,
                "Surname": body.last_name,
                "Phone Number": body.telephone,
                "Email": body.email,
                "Need Hostel": body.need_hostel,
                "Dinner of the 14th": body.dinner_14,
                "Other People Inside Confirmation": [],
                "Special Food Needs": body.particular_food,
                "Special Mobility Needs": body.particular_mobility,
                "Special Baby Needs": body.particular_babies,
                "Message": body.message
              };

              other_participants = [];
              body.others.forEach(element => {
                  if(!(element.tag === "")) {
                    other_participants.push(element.tag);
                  }
              });

            // send to creation backend using a recursive call via callbacks
            return create_records(main_record,other_participants,0,res);
             
}

// recursive callback function to create the child records then the main record referring to them
function create_records(main_record,other_participants,participants_created,res) {

    var base = res.app.get("base")

    if(participants_created < other_participants.length) {
        current_child = other_participants[participants_created++];
        console.log("Creating child - "+ current_child)
        base('Other People Inside Confirmation').create({
            "Name and Surname": current_child
        }, function(err, child_record) {
            if (err) { 
                console.error(err);
                return send_error(res,"Error while writing child record "+current_child);
            }
            // add to the recursion parent record reference the child id and call recursion through callback
            main_record["Other People Inside Confirmation"].push(child_record.getId());
            return create_records(main_record,other_participants,participants_created,res);
        });
    } else {
        // all childs inserted, so create the parent record
        console.log("Creating main record with childs "+ main_record["Other People Inside Confirmation"])
        base('Automatic Confirmations').create(main_record, function(err, record) {
              if (err) { 
                  console.error(err);
                  return send_error((res,"Error while writing main record"));  
              }
            return send_confirmation_email(main_record,other_participants,res);
          });
    }
}


function send_success(res) {
    res.send("Records created successfully");
}

function send_error(res,message="Generic error",error_code=500,body=null) {
    res.statusCode = error_code;
    if(body) {
        console.error("Error during confirmation - %d %s - on body %j", message, error_code, body)
    } else {
        console.error("Error during confirmation - %d %s", message, error_code)
    }
    res.send(message);
}

function send_confirmation_email(record,other_participants,res) {
    mail_flag = false
    if(mail_flag) {
        var transport = res.app.get("mailer-transport");

        // restore the old array content in order to have a nice display in the email
        record["Other People Inside Confirmation"] = other_participants

        var mailOptions = {
            from: 'confirmation@jointhekoalition.eu',
            to: 'ariane.paolo@jointhekoalition.eu',
            subject: '[Confirmation] '+record["Name"] + " " + record["Surname"],
            html: "<p>Confirmation received at " + new Date() +"</p>" +json_to_html(record)
        };
        
        transport.sendMail(mailOptions, function(error, info){
            if (error) {
            console.log(error);
            return send_error(res,"Error while sending the email");
            } 
            return send_success(res);
        });
    } else {
        send_success(res);
    }
}

function json_to_html(object) {
    html = "<table>"
    for(x in object) {
        html += "<tr><td><b>"+x+"</b></td><td>"+object[x]+"</td></tr>"
    }
    html += "</table>"
    return html
}


exports.execute_get = execute_get
exports.execute_post = execute_post