// /frontend/App.js
import React, { useState, useEffect } from 'react';

function App() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    window.api.getUsers().then(setUsers).catch(console.error);
  }, []);

  const handleAddUser = () => {
    const name = prompt("Enter name:");
    const email = prompt("Enter email:");

    window.api.addUser(name, email).then((result) => {
      alert(`User added with ID: ${result.id}`);
      window.api.getUsers().then(setUsers); // Refresh users after adding
    }).catch(console.error);
  };

  return (
    <div>
      <h1>Users</h1>
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.name} ({user.email})</li>
        ))}
      </ul>
      <button onClick={handleAddUser}>Add User</button>
    </div>
  );
}

export default App;
