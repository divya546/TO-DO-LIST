// backend of task manager
const express = require('express');
const fs = require('fs');
const cors = require("cors");
const { error } = require('console');
const { parse } = require('path');
const app = express();
const jwt = require("jsonwebtoken");

require('dotenv').config();
const JWT_SECRET= "BEYOUROWNSELF";
const nodemailer=require('nodemailer');
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
 app.post('/register',(req,res)=>{
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const rowData=fs.readFileSync("todo.json",'utf-8');
    const users= rowData?JSON.parse(rowData):[];
    const existingUser = users.find(u=>u.email===email && u.password===password);
    if(existingUser){
        return res.status(400).json({
            message:"user is already registered"
        });
    }
    users.push({name,email,password,todos:[]});
    fs.writeFile("todo.json",JSON.stringify(users,null,2),(err)=>{
    if(err){
          return res.status(400).json({message:"Error in registering"})
        }
        res.status(200).json({
        message:"Successfully Registered!"
     }) 
    })
    
   
 })
 app.post('/login',(req,res)=>{
    const email=req.body.email;
    const password = req.body.password;
    const rowData = fs.readFileSync('todo.json','utf-8');
    const users=rowData?JSON.parse(rowData):[];
    const user= users.find(u=>u.email===email && u.password===password);
    if(!user ){
        return res.status(400).json({
            message:"Invalid username or passward."
        });
    }
    const token = jwt.sign({
        email:email,
    },JWT_SECRET);
    user.token= token;
    fs.writeFileSync('todo.json',JSON.stringify(users,null,2));
    res.json({
        token:token,
        
    }) 
 })
 app.get("/getTodo",(req,res)=>{
    const rawtoken = req.headers['authorization'];
    const token = rawtoken?.split(' ')[1];
    const rowData = fs.readFileSync('todo.json','utf-8');
    const usableData= rowData?JSON.parse(rowData):[];
    const todo =usableData.find(u=>u.token===token);
    if(!todo){
        return res.status(400).json({
            message:"Invalid token"
        })
    }
    if(todo){
        return res.status(200).json({
            todos:todo.todos
        })
    }
    return res.status(200).json({
        message:"No todos exist"
    })
 })
 app.post('/addToDo',(req,res)=>{
    const newTodo = req.body;
    const rawtoken = req.headers['authorization'];
     const token = rawtoken && rawtoken.startsWith("Bearer ") ? rawtoken.split(" ")[1] : rawtoken;
     
    let users;
  try{
    const data=fs.readFileSync('todo.json','utf-8');
    users=JSON.parse(data);
  }catch{
    return res.status(400).json({
        message:"Problem in reading file."
    })
  }
  if(!token){
    return res.status(400).json({
        message:"No token provided. Login again!"
    })
  }
  let decodedInfo;
  try{
    decodedInfo= jwt.verify(token,JWT_SECRET);
  } catch{
    return res.status(400).json({
        message:"Expired token."
    })
  }
  const user = users.find(l=>l.mobile === decodedInfo.mobile);
  if(!user){
    return res.status(400).json({
        message:"Invalid token, Log in again!"
    })
  }
  if(!user.todos) user.todos=[];
  user.todos.push(newTodo);
  
    try{
        fs.writeFileSync("todo.json",JSON.stringify(users,null,2));
        res.status(200).json({
            message:"Successfully added"
        })
    }catch{
        res.status(400).json({
            message:"Error in adding"
        })
    }
    
 })
 app.delete('/delete',(req,res)=>{
     const id= req.body.id;
     const rawToken = req.headers['authorization'];
     const token =rawToken && rawToken.startsWith('bearer ')?rawToken.split(" ")[1]:rawToken;
    let decodedInfo;
    try{
        decodedInfo= jwt.verify(token,JWT_SECRET);
    }catch{
        return res.status(400).json({
            message:"Invalid token."
        })
    }
     fs.readFile('todo.json','utf-8',(err,data)=>{
        if(err){
            res.status(400).json({message: "Error in reading the file."})
        }
        let users = JSON.parse(data);
        let user =users.find(e=>e.mobile ===decodedInfo.mobile);
        if(!user){
            return res.status(400).json({
                message:"Invalid token."
            })
        }
        user.todos= user.todos.filter(t=>t.id !==id);

        fs.writeFile('todo.json',JSON.stringify(users,null,2),(err)=>{
            if(err){
                res.status(500).json({message:"Error in fetching internally"})
            }
            res.status(200).json({message:"Todo successfully deleted"});
        })
       
     })
 })
 app.put("/edit",(req,res)=>{
    const text = req.body.text;
    const id = req.body.id;
    const rawToken= req.headers['authorization'];
    const token = rawToken && rawToken.toLowerCase().startsWith("bearer ")?rawToken.split(" ")[1]:rawToken;
    if(!token){
        return res.status(400).json({
            message:"Token not found."
        })
    }
    let decodedInfo;
    try{
        decodedInfo= jwt.verify(token,JWT_SECRET);
    }catch{
        return res.status(400).json({
            message:"Expired token.Please login again."
        })
    }
    fs.readFile("todo.json",'utf-8',(err,data)=>{
        if(err){
            return res.status(500).json({
                message:"Error in reading file."
            })
        }let users = JSON.parse(data);
       
   
        let user = users.find(e=>e.mobile ===decodedInfo.mobile);
        if(!user){
            return res.status(400).json({
                message:"User of this token does not found!"
            })
        }

    let todoTobeUpdated = user.todos.find(t=>t.id === id);
    if(!todoTobeUpdated){
        return res.status(404).json({
            message:"Todo not found."
        })
    }
    todoTobeUpdated.text=text;
    fs.writeFile('todo.json',JSON.stringify(users,null,2),'utf-8',err=>{
        if(err){
            return res.status(500).json({
                message:"Error in updating in file"
            })
        }return res.status(200).json({
        message:"successfully updated"
    })
    })
    
 }); 


 })
 app.listen(3000,()=>{
    console.log("App is running on http://localhost:3000");
 })