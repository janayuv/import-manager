-- V2__notifications.sql
-- Migration for notifications system
-- This migration adds the notifications table for the notification system

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    category TEXT,
    action_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
