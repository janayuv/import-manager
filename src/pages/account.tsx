import { toast } from 'sonner';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type User = { name: string; email: string };

const getUser = (): User => {
  const name = localStorage.getItem('user_name') || 'User';
  const email = localStorage.getItem('user_email') || 'user@example.com';
  return { name, email };
};

export const AccountDetailsPage = () => {
  const [user] = useState<User>(getUser());
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-blue-600">
            Account Details
          </CardTitle>
          <CardDescription>
            Manage your user account information and preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <strong>Name:</strong> {user.name}
            </div>
            <div>
              <strong>Email:</strong> {user.email}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const AccountUpdatePage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  useEffect(() => {
    const u = getUser();
    setName(u.name);
    setEmail(u.email);
  }, []);
  const save = () => {
    localStorage.setItem('user_name', name);
    localStorage.setItem('user_email', email);
    toast.success('Profile updated');
  };
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Update Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Email</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <Button onClick={save}>Save</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export const AccountPasswordPage = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const change = () => {
    if (next.length < 6)
      return toast.error('Password must be at least 6 characters');
    if (next !== confirm) return toast.error('Passwords do not match');
    // In a real app, call backend to change password
    toast.success('Password changed');
    setCurrent('');
    setNext('');
    setConfirm('');
  };
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm">Current Password</label>
            <Input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm">New Password</label>
            <Input
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm">Confirm Password</label>
            <Input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
          </div>
          <Button onClick={change}>Update Password</Button>
        </CardContent>
      </Card>
    </div>
  );
};
