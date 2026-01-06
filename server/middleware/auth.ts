import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { logger } from '../logger';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: any;
      requestId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
  
  if (!userId) {
    logger.warn({ requestId: req.requestId, path: req.path }, 'Unauthorized access attempt');
    return res.status(401).json({ 
      message: 'Not authenticated',
      code: 'UNAUTHORIZED',
      requestId: req.requestId
    });
  }
  
  req.userId = userId;
  next();
}

export async function requireGroupAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId;
  const groupId = req.params.id || req.body.groupId;
  
  if (!groupId) {
    return res.status(400).json({ 
      message: 'Group ID required',
      code: 'MISSING_GROUP_ID',
      requestId: req.requestId
    });
  }
  
  try {
    const group = await storage.getGroup(groupId);
    
    if (!group) {
      return res.status(404).json({ 
        message: 'Group not found',
        code: 'GROUP_NOT_FOUND',
        requestId: req.requestId
      });
    }
    
    if (group.adminId !== userId) {
      logger.warn({ requestId: req.requestId, userId, groupId }, 'Non-admin attempted admin action');
      return res.status(403).json({ 
        message: 'Only group admin can perform this action',
        code: 'FORBIDDEN_NOT_ADMIN',
        requestId: req.requestId
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireGroupMember(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId;
  const groupId = req.params.id || req.body.groupId;
  
  if (!groupId) {
    return res.status(400).json({ 
      message: 'Group ID required',
      code: 'MISSING_GROUP_ID',
      requestId: req.requestId
    });
  }
  
  try {
    const members = await storage.getGroupMembers(groupId);
    
    if (!members.includes(userId!)) {
      logger.warn({ requestId: req.requestId, userId, groupId }, 'Non-member attempted access');
      return res.status(403).json({ 
        message: 'You are not a member of this group',
        code: 'FORBIDDEN_NOT_MEMBER',
        requestId: req.requestId
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireSessionParticipant(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId;
  const sessionId = req.params.id || req.params.sessionId || req.body.sessionId;
  
  if (!sessionId) {
    return res.status(400).json({ 
      message: 'Session ID required',
      code: 'MISSING_SESSION_ID',
      requestId: req.requestId
    });
  }
  
  try {
    const participants = await storage.getSessionParticipants(sessionId);
    const isParticipant = participants.some(p => p.userId === userId && p.status !== 'left');
    
    if (!isParticipant) {
      logger.warn({ requestId: req.requestId, userId, sessionId }, 'Non-participant attempted session access');
      return res.status(403).json({ 
        message: 'You are not a participant in this session',
        code: 'FORBIDDEN_NOT_PARTICIPANT',
        requestId: req.requestId
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireSessionNotLocked(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.params.id || req.params.sessionId || req.body.sessionId;
  
  if (!sessionId) {
    return next();
  }
  
  try {
    const session = await storage.getSession(sessionId);
    
    if (session?.status === 'locked') {
      return res.status(403).json({ 
        message: 'Session is locked - voting is closed',
        code: 'SESSION_LOCKED',
        requestId: req.requestId
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
}
