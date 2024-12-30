import React from "react";
import {Avatar} from "antd";

const userImageList = [
  {
    id: 1,
    image: "/assets/images/150.png",
  },
  {
    id: 2,
    image: "/assets/images/150.png",
  },
  {
    id: 3,
    image: "/assets/images/150.png",

  },
  {
    id: 4,
    image: "/assets/images/150.png",
    name: 'Mila Alba',
    rating: '5.0',
    deals: '27 Deals'
  },
]

export const aboutList = [
  {
    id: 1,
    title: 'Product',
    icon: 'company',
    userList: '',
    desc: ['Product A']
  },
  {
    id: 2,
    title: 'Birthday',
    icon: 'birthday-new',
    userList: '',
    desc: ['Oct 25, 1984']
  },
  {
    id: 3,
    title: 'Entered By',
    icon: 'graduation',
    userList: '',
    desc: ['Tendai']
  },
  {
    id: 4,
    title: 'Medical Scheme',
    icon: 'home',
    userList: '',
    desc: ['Discovery']
  },
  {
    id: 5,
    title: 'Medical Scheme Option',
    icon: 'home',
    userList: '',
    desc: ['Advance']
  },
  {
    id: 6,
    title: 'Medical Scheme Option',
    icon: 'home',
    userList: '',
    desc: ['34567865']
  },
];

export const eventList = [
  {
    id: 1,
    image: "https://via.placeholder.com/575X480",
    title: 'Sundance Film Festival.',
    address: 'Downsview Park, Toronto, Ontario',
    date: 'Feb 23, 2019',
  },
  {
    id: 2,
    image: "https://via.placeholder.com/575X480",
    title: 'Underwater Musical Festival.',
    address: 'Street Sacramento, Toronto, Ontario',
    date: 'Feb 24, 2019',
  },
  {
    id: 3,
    image: "https://via.placeholder.com/575X480",
    title: 'Village Feast Fac',
    address: 'Union Street Eureka',
    date: 'Oct 25, 2019',
  }
];

export const contactList = [
  {
    id: 1,
    title: 'Email',
    icon: 'email',
    desc: [<span className="gx-link" key={1}>test@example.com</span>]
  },
  {
    id: 2,
    title: 'ID Number',
    icon: 'link',
    desc: [<span className="gx-link" key={2}>454746585858</span>]
  }, {
    id: 3,
    title: 'Phone',
    icon: 'phone',
    desc: ['+27 8980 898 987']
  },
];

export const friendList = [
  {
    id: 1,
    image: "https://via.placeholder.com/150",
    name: 'Chelsea Johns',
    status: 'online'

  },
  {
    id: 2,
    image:"https://via.placeholder.com/150",
    name: 'Ken Ramirez',
    status: 'offline'
  },
  {
    id: 3,
    image: "https://via.placeholder.com/150",
    name: 'Chelsea Johns',
    status: 'away'

  },
  {
    id: 4,
    image:"https://via.placeholder.com/150",
    name: 'Ken Ramirez',
    status: 'away'
  },
];
