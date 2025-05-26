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

require('dotenv').config();
const JWT_SECRET= process.env.TOKEN;
const nodemailer=require('nodemailer');
mongoose.connect(process.env.MONGOOSE_URL);

const transporter=nodemailer.createTransport({
       service:"gmail",
       auth: {
        user:process.env.EMAIL_USER,
        pass:process.env.EMAIL_PASS
       },

})
const otpStore={};
app.use(cors());
app.use(express.json());
app.use(express.static('signin'));
   
 app.post('/send-otp',(req,res)=>{
    const email= req.body.email;
    if(!email){
        return res.status(404).json({
            message:"Please enter the email."
        })
    }
    const otp =Math.floor(100000+Math.random()*900000);
    const expiresAt = Date.now()+300000;
    
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
    }return res.status(200).json({
        message:"OTP is correct"
    })

 })
 app.post('/register',async (req,res)=>{
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const user = await UserModel.findOne({
        email:email,
    })
    if(user){
        return res.status(300).json({
            message:"User already exists"
        })
    }
   try{ 
     const customer =await UserModel.create({
    email:email,
    name:name,
    password:password
   })
   
     res.status(200).json({
        message:"Successfully registered!"
     })}
    catch(error){
        console.log(error);
     res.status(400).json({
        message:"Error in registering."
     })
    }
    
   
 })
 app.post('/login',async(req,res)=>{
    const email=req.body.email;
    const password = req.body.password;
    const user = await UserModel.findOne({
        email:email,
        password:password
    })
    try{if(user){
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