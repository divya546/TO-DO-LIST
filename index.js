// backend of task manager
const express = require('express');
const fs = require('fs');
const cors = require("cors");
const mongoose= require("mongoose");
const {UserModel,toDoModel}=require("./db");
const { error } = require('console');
const { parse } = require('path');
const app = express();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const {z} = require("zod");

require('dotenv').config();
const JWT_SECRET= process.env.TOKEN;
const nodemailer=require('nodemailer');
const { string } = require('zod/v4');
mongoose.connect(process.env.MONGOOSE_URL);

const transporter=nodemailer.createTransport({
       service:"gmail",
       auth: {
        user:process.env.EMAIL_USER,
        pass:process.env.EMAIL_PASS
       },

})
const otpVerified ={};
const otpStore={};
app.use(cors());
app.use(express.json());
app.use(express.static('signin'));
   
 app.post('/send-otp',(req,res)=>{
    
    const zmail = z.object({
        email:z.string().email()
    })
  const resultantEmail = zmail.safeParse(req.body);
  if(!resultantEmail.success){
    return res.status(422).json({
        message:"Invalid format",
        error:resultantEmail.error
    })
  }

    if(!resultantEmail){
        return res.status(404).json({
            message:"Please enter the email."
        })
    }
    const otp =Math.floor(100000+Math.random()*900000);
    const expiresAt = Date.now()+300000;
    const email = resultantEmail.data.email;
    otpStore[email]={otp,expiresAt};
    const mailOptions={
        from:process.env.EMAIL_USER,
        to:email,
        subject:'Your OTP is:',
        text: ` Your OTP code is ${otp}.Valid for only 5 minutes.`
    }
    transporter.sendMail(mailOptions,(err,info)=>{
     if(err){
        console.log(err);
        return res.status(500).json({
            message:"Couldn't send message."
        })
     } return res.status(200).json({
        message:"OTP Successfully sent!"
     })
    })
 })
 app.post('/verify-otp',(req,res)=>{
    const email = req.body.email;
    const otp = req.body.otp;
    if(!email || !otp){
        return res.status(400).json({
            message:"Email or Otp not found.Please enter email and otp"
        })
    }
      otpVerified[email]= true;
     const otpData = otpStore[email];
     if(!otpData){
        return res.status(400).json({
            message:"OTP not found."
        })
     }

    if(Date.now()>otpData.expiresAt){
        return res.status(400).json({
            message:"OTP expired.Please ask for new one!"
        })
    }
    if(otpData.otp != parseInt(otp)){
        return res.status(400).json({
            message:"Incorrect OTP."
        })
    } 
    return res.status(200).json({
        message:"OTP is correct"
    })

 })
 app.post('/register',async (req,res)=>{
    const reqBody = z.object({
        email:z.string().min(6).email().max(100),
        password:z.string().min(6).max(50).regex(/[A-Z]/,"Password should have atleast one Capital letter").
        regex(/[a-z]/,"Password should constain atleast one small character.").
        regex(/[^A-Za-z0-9]/,"Password should conatoion atleast one special character"),
        name:z.string().max(100)

    })
    const parsedData = reqBody.safeParse(req.body);
    if(!parsedData.success){
        return res.status(400).json({
            message:"Invalid format",
            error: parsedData.error
        })
    }
    const {name ,email,password} = parsedData.data;
    try{
           const user = await UserModel.findOne({
            email:email
           })
           if(user){
            return res.status(409).json({
                message:"User already exists."
            })
           }
           if(!otpVerified[email]){
            console.log("Unproccessable entity.")
            return res.status(422).json({
                message:"Otp not verified."
            })
           }
           const hashedPassword =  await bcrypt.hash(password,10);
           await UserModel.create({
            name:name,
            email:email,
            password:hashedPassword
           });
           delete(otpVerified[email]);
           return res.status(200).json({
            message:"Successfully Registered!"
           })

    }catch(error){
        console.log(error)
        return res.status(500).json({
            message:"Unable to register."
        })
    }
    
 })
 app.post('/login',async(req,res)=>{
    const email=req.body.email;
    const password = req.body.password;
    const user = await UserModel.findOne({
        email:email,
    })
    const passwordMatched = await bcrypt.compare(password,user.password);

    try{if(passwordMatched){
        const token = jwt.sign({
        id:user._id,
        },JWT_SECRET);
        res.status(200).json({
            message:"Login Successfull",
            token
        })
       }
    else{
        res.status(403).json({
            message:"Incorrect credentials"
        })
    }}catch{
        res.status(404).json({
            message:"Login failed due to some issue."
        })
    }
    
    
 }
)
 app.get("/getTodo",async(req,res)=>{
    const rawtoken = req.headers['authorization'];
    const token = rawtoken?.split(' ')[1];
    if (!token) {
    return res.status(401).json({ message: "JWT token not provided" });
  }
    try{
    const decoded = jwt.verify(token,JWT_SECRET);
    const user = await UserModel.findById(decoded.id);
    if(user){
        const todos = await toDoModel.find({
           userId:user._id
        })
        if(todos.length>0){
            res.status(200).json({
                todos:todos
            })
        }else{
            res.status(200).json({
                message:"No todos found"
            })
        }
    }}catch(error){
        console.log(error);
        res.status(404).json({
            message:"Some error in fetching the data"
        })
    }
 })
 app.post('/addToDo',async(req,res)=>{
    const {title} = req.body;
    const rawtoken = req.headers['authorization'];
     const token = rawtoken && rawtoken.startsWith("Bearer ") ? rawtoken.split(" ")[1] : rawtoken;
     
    let users;
  
  if(!token){
    return res.status(400).json({
        message:"No token provided. Login again!"
    })
  }
  try{
    const decoded = jwt.verify(token,JWT_SECRET);
    if(decoded){
        const todo =await toDoModel.create({
              title:title,
              done:false,
              userId:decoded.id
        })
        res.status(200).json({
            message:"Successfully added",
            todo:todo
            
        })
    }
  }catch(error){
    console.log(error);
    res.status(400).json({
        message:"Error in adding todos"
    })
  }
  
    
 })
 app.delete('/delete',async (req,res)=>{
     const id= req.body.id;
     const rawToken = req.headers['authorization'];
     const token =rawToken && rawToken.startsWith('bearer ')?rawToken.split(" ")[1]:rawToken;
    let decodedInfo;
      try{
        decodedInfo= jwt.verify(token,JWT_SECRET);
   
     if(decodedInfo){
        await toDoModel.deleteOne({
            _id:id,
            userId:decodedInfo.id
        })
        return res.status(200).json({
            message:"Todo deleted successfully"
        })
     }
    }catch(err){
        console.log(err);
        return res.status(404).json({
            message:"Error in deleting"
        })
    }
     
 })
 app.put("/edit",async(req,res)=>{
    const {title} = req.body;
    const id = req.body.id;
    const rawToken= req.headers['authorization'];
    const token = rawToken && rawToken.toLowerCase().startsWith("bearer ")?rawToken.split(" ")[1]:rawToken;
    if(!token){
        return res.status(400).json({
            message:"Token not found."
        })
    }
    let decodedInfo;
    decodedInfo= jwt.verify(token,JWT_SECRET)
    try{
        console.log("Edited is called")
        await toDoModel.updateOne(
           { userId:decodedInfo.id,},
           { $set:{title:title}}
        )
      return res.status(200).json({
        message:"Updated successfully"
      })

    }catch(error){
        console.log(error);
        return res.status(400).json({
            message:"Error in updation."
        })
    }
    
})
 app.listen(3000,()=>{
    console.log("App is running on http://localhost:3000");
 })