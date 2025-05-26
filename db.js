const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId=mongoose.ObjectId;
const todo = new Schema({
    title:String,
    done:Boolean,
    userId:{type:ObjectId,ref:'users'}
})
const user = new Schema({
    email:{type:String,unique:true},
    password:String,
    name:String,
    todos:[{type:todo,ref:'todos'}]
})

const UserModel=mongoose.model('users',user);
const toDoModel = mongoose.model('todos',todo);
module.exports={
    UserModel:UserModel,
    toDoModel:toDoModel
}