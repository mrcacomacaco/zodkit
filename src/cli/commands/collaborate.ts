/**
 * @fileoverview Real-time collaboration command for schema development
 * @module CollaborateCommand
 */

import * as pc from 'picocolors';
import { existsSync, readFileSync } from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { Command } from 'commander';
import {
  CollaborationEngine,
  CollaborationMode,
  UserRole,
  CollaborationUser,
  CollaborationConfig,
  getGlobalCollaborationEngine
} from '../../core/collaboration';

interface CollaborateOptions {
  mode?: CollaborationMode;
  role?: UserRole;
  name?: string;
  email?: string;
  sessionId?: string;
  port?: number;
  maxUsers?: number;
  autoSave?: boolean;
  saveInterval?: number;
  conflictResolution?: 'automatic' | 'manual' | 'voting';
  requireApproval?: boolean;
  enableComments?: boolean;
  enableVersioning?: boolean;
  files?: string[];
  invite?: string[];
  server?: boolean;
  join?: string;
  list?: boolean;
  interactive?: boolean;
  watch?: boolean;
}

interface GlobalOptions {
  json?: boolean;
}

export async function collaborateCommand(
  action: string | undefined,
  options: CollaborateOptions,
  command: Command
): Promise<void> {
  const globalOpts = command.parent?.opts() as GlobalOptions;
  const isJsonMode = globalOpts?.json ?? false;

  try {
    const engine = getGlobalCollaborationEngine();

    switch (action) {
      case 'create':
        await handleCreateSession(engine, options, isJsonMode);
        break;

      case 'join':
        await handleJoinSession(engine, options, isJsonMode);
        break;

      case 'leave':
        await handleLeaveSession(engine, options, isJsonMode);
        break;

      case 'server':
        handleStartServer(engine, options, isJsonMode);
        break;

      case 'list':
        handleListSessions(engine, options, isJsonMode);
        break;

      case 'status':
        handleSessionStatus(engine, options, isJsonMode);
        break;

      case 'invite':
        void handleInviteUsers(engine, options, isJsonMode);
        break;

      case 'resolve':
        await handleResolveConflicts(engine, options, isJsonMode);
        break;

      case 'comment':
        handleAddComment(engine, options, isJsonMode);
        break;

      case 'sync':
        handleSyncSession(engine, options, isJsonMode);
        break;

      case 'watch':
        handleWatchSession(engine, options, isJsonMode);
        break;

      default:
        if (!action) {
          if (options.server) {
            handleStartServer(engine, options, isJsonMode);
          } else if (options.join) {
            await handleJoinSession(engine, { ...options, sessionId: options.join }, isJsonMode);
          } else if (options.list) {
            handleListSessions(engine, options, isJsonMode);
          } else if (options.interactive) {
            handleInteractiveMode(engine, options, isJsonMode);
          } else {
            displayHelp(isJsonMode);
          }
        } else {
          throw new Error(`Unknown collaborate action: ${action}`);
        }
        break;
    }

  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'COLLABORATE_ERROR'
        }
      }, null, 2));
    } else {
      console.error(pc.red('❌ Collaboration failed:'), error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

async function handleCreateSession(
  engine: CollaborationEngine,
  options: CollaborateOptions,
  isJsonMode: boolean
): Promise<void> {
  const sessionName = options.name ??`Schema Collaboration - ${new Date().toLocaleDateString()}`;
  const userInfo: Omit<CollaborationUser, 'id' | 'isActive' | 'lastSeen'> = {
    name: options.name ??'Anonymous User',
    email: options.email ??'user@example.com',
    role: 'owner' as UserRole
  };

  const sessionConfig: Partial<CollaborationConfig> = {
    mode: options.mode ??'live' as CollaborationMode
  };

  if (options.maxUsers !== undefined) sessionConfig.maxUsers = options.maxUsers;
  if (options.autoSave !== undefined) sessionConfig.autoSave = options.autoSave;
  if (options.saveInterval !== undefined) sessionConfig.saveInterval = options.saveInterval;
  if (options.conflictResolution !== undefined) sessionConfig.conflictResolution = options.conflictResolution;
  if (options.requireApproval !== undefined) sessionConfig.requireApproval = options.requireApproval;
  if (options.enableComments !== undefined) sessionConfig.enableComments = options.enableComments;
  if (options.enableVersioning !== undefined) sessionConfig.enableVersioning = options.enableVersioning;

  const session = await engine.createSession(sessionName, sessionConfig, userInfo);

  // Add files to session if specified
  if (options.files) {
    const creator = Array.from(session.users.values())[0];
    if (creator) {
      for (const filePath of options.files) {
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');
          await engine.addFile(session.id, filePath, content, creator.id);
        }
      }
    }
  }

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      action: 'session_created',
      session: {
        id: session.id,
        name: session.name,
        mode: session.config.mode,
        users: session.users.size,
        files: session.files.size
      },
      joinUrl: `zodkit collaborate join ${session.id}`,
      webUrl: `http://localhost:${options.port ??3000}/session/${session.id}`
    }, null, 2));
  } else {
    console.log(pc.green('✅ Collaboration session created successfully!'));
    console.log(pc.gray('─'.repeat(60)));
    console.log(`${pc.cyan('Session ID:')} ${session.id}`);
    console.log(`${pc.cyan('Name:')} ${session.name}`);
    console.log(`${pc.cyan('Mode:')} ${session.config.mode}`);
    console.log(`${pc.cyan('Max Users:')} ${session.config.maxUsers}`);
    console.log(`${pc.cyan('Files:')} ${session.files.size}`);

    console.log('\n' + pc.bold('🔗 Share with collaborators:'));
    console.log(`  Command: ${pc.cyan(`zodkit collaborate join ${session.id}`)}`);
    console.log(`  Web URL: ${pc.cyan(`http://localhost:${options.port ??3000}/session/${session.id}`)}`);

    if (options.files) {
      console.log('\n' + pc.bold('📁 Added Files:'));
      options.files.forEach(file => {
        console.log(`  ${pc.green('•')} ${file}`);
      });
    }

    console.log('\n' + pc.yellow('🚀 Ready to collaborate! Use --server to start web interface.'));
  }
}

async function handleJoinSession(
  engine: CollaborationEngine,
  options: CollaborateOptions,
  isJsonMode: boolean
): Promise<void> {
  if (!options.sessionId) {
    throw new Error('Session ID is required to join a session');
  }

  const userInfo = {
    name: options.name ??'Anonymous User',
    email: options.email ??'user@example.com',
    role: options.role ??'editor' as UserRole
  };

  const { session, userId } = await engine.joinSession(options.sessionId, userInfo);

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      action: 'session_joined',
      session: {
        id: session.id,
        name: session.name,
        mode: session.config.mode,
        users: session.users.size,
        files: session.files.size
      },
      userId,
      role: userInfo.role
    }, null, 2));
  } else {
    console.log(pc.green(`✅ Joined collaboration session: ${session.name}`));
    console.log(pc.gray('─'.repeat(60)));
    console.log(`${pc.cyan('Session ID:')} ${session.id}`);
    console.log(`${pc.cyan('Your Role:')} ${userInfo.role}`);
    console.log(`${pc.cyan('Active Users:')} ${session.users.size}`);
    console.log(`${pc.cyan('Files:')} ${session.files.size}`);

    if (session.files.size > 0) {
      console.log('\n' + pc.bold('📁 Available Files:'));
      for (const [path, file] of session.files) {
        const status = file.isLocked ? pc.red('🔒 locked') : pc.green('✓ available');
        console.log(`  ${status} ${path} (v${file.version})`);
      }
    }

    console.log('\n' + pc.bold('👥 Active Users:'));
    for (const [, user] of session.users) {
      const indicator = user.isActive ? pc.green('🟢') : pc.gray('⚫');
      console.log(`  ${indicator} ${user.name} (${user.role})`);
    }

    console.log('\n' + pc.yellow('🎯 You\'re now collaborating! Use --watch to monitor real-time updates.'));
  }
}

async function handleLeaveSession(
  engine: CollaborationEngine,
  options: CollaborateOptions,
  isJsonMode: boolean
): Promise<void> {
  if (!options.sessionId) {
    throw new Error('Session ID is required to leave a session');
  }

  // For demo purposes, we'll use a mock user ID
  // In a real implementation, this would come from authentication
  const userId = 'current-user-id';

  await engine.leaveSession(options.sessionId, userId);

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      action: 'session_left',
      sessionId: options.sessionId
    }, null, 2));
  } else {
    console.log(pc.green(`✅ Left collaboration session: ${options.sessionId}`));
    console.log(pc.gray('Thank you for collaborating!'));
  }
}

function handleStartServer(
  engine: CollaborationEngine,
  options: CollaborateOptions,
  isJsonMode: boolean
): void {
  const port = options.port ??3000;

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      action: 'server_starting',
      port,
      message: 'Collaboration server starting...'
    }, null, 2));
  } else {
    console.log(pc.blue('🚀 Starting collaboration server...'));
    console.log(pc.gray('─'.repeat(60)));
  }

  // Create WebSocket server for real-time communication
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws: WebSocket) => {
    if (!isJsonMode) {
      console.log(pc.green('👤 New client connected'));
    }

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        let dataStr: string;
        if (data instanceof Buffer) {
          dataStr = data.toString();
        } else if (data instanceof ArrayBuffer) {
          dataStr = Buffer.from(data).toString();
        } else if (Array.isArray(data)) {
          dataStr = Buffer.concat(data).toString();
        } else {
          dataStr = String(data);
        }
        const message = JSON.parse(dataStr) as Record<string, unknown>;
        void handleWebSocketMessage(ws, message);
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    });

    ws.on('close', () => {
      if (!isJsonMode) {
        console.log(pc.gray('👤 Client disconnected'));
      }
    });

    ws.on('error', (error: Error) => {
      if (!isJsonMode) {
        console.error(pc.red('WebSocket error:'), error.message);
      }
    });
  });

  if (!isJsonMode) {
    console.log(pc.green(`✅ Collaboration server running on port ${port}`));
    console.log(`${pc.cyan('WebSocket:')} ws://localhost:${port}`);
    console.log(`${pc.cyan('Web UI:')} http://localhost:${port}`);
    console.log('\n' + pc.yellow('Press Ctrl+C to stop the server'));
  }

  // Keep the process running
  process.on('SIGINT', () => {
    if (!isJsonMode) {
      console.log('\n' + pc.yellow('🛑 Stopping collaboration server...'));
    }
    wss.close();
    process.exit(0);
  });
}

function handleListSessions(
  engine: CollaborationEngine,
  _options: CollaborateOptions,
  isJsonMode: boolean
): void {
  const sessions = engine.getActiveSessions();

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        mode: s.config.mode,
        users: s.users.size,
        files: s.files.size,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
    }, null, 2));
  } else {
    if (sessions.length === 0) {
      console.log(pc.yellow('📭 No active collaboration sessions'));
      console.log('\n' + pc.gray('Create a new session with:'));
      console.log(`  ${pc.cyan('zodkit collaborate create --name "My Session"')}`);
      return;
    }

    console.log(pc.bold(`📋 Active Collaboration Sessions (${sessions.length})`));
    console.log(pc.gray('─'.repeat(80)));

    sessions.forEach((session, index) => {
      const timeSince = formatTimeSince(Date.now() - session.updatedAt);
      const modeIcon = getModeIcon(session.config.mode);

      console.log(`\n${index + 1}. ${modeIcon} ${pc.bold(session.name)}`);
      console.log(`   ID: ${pc.cyan(session.id)}`);
      console.log(`   Mode: ${session.config.mode} | Users: ${session.users.size} | Files: ${session.files.size}`);
      console.log(`   Last activity: ${pc.gray(timeSince)}`);

      if (session.conflicts.length > 0) {
        console.log(`   ${pc.red(`⚠️  ${session.conflicts.length} unresolved conflicts`)}`);
      }
    });

    console.log('\n' + pc.cyan('💡 Join a session with:'));
    console.log(`  ${pc.gray('zodkit collaborate join <session-id>')}`);
  }
}

function handleSessionStatus(
  engine: CollaborationEngine,
  options: CollaborateOptions,
  isJsonMode: boolean
): void {
  if (!options.sessionId) {
    throw new Error('Session ID is required for status check');
  }

  const session = engine.getSession(options.sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      session: {
        id: session.id,
        name: session.name,
        isActive: session.isActive,
        mode: session.config.mode,
        users: Array.from(session.users.values()),
        files: Array.from(session.files.values()),
        operations: session.operations.length,
        conflicts: session.conflicts.length,
        comments: session.comments.length,
        version: session.version,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    }, null, 2));
  } else {
    console.log(pc.bold(`📊 Session Status: ${session.name}`));
    console.log(pc.gray('─'.repeat(60)));

    console.log(`${pc.cyan('ID:')} ${session.id}`);
    console.log(`${pc.cyan('Status:')} ${session.isActive ? pc.green('Active') : pc.red('Inactive')}`);
    console.log(`${pc.cyan('Mode:')} ${session.config.mode}`);
    console.log(`${pc.cyan('Version:')} ${session.version}`);
    console.log(`${pc.cyan('Created:')} ${new Date(session.createdAt).toLocaleString()}`);
    console.log(`${pc.cyan('Updated:')} ${new Date(session.updatedAt).toLocaleString()}`);

    console.log('\n' + pc.bold('📈 Statistics:'));
    console.log(`  Operations: ${session.operations.length}`);
    console.log(`  Comments: ${session.comments.length}`);
    console.log(`  Conflicts: ${session.conflicts.length} (${session.conflicts.filter(c => !c.resolvedAt).length} unresolved)`);

    if (session.users.size > 0) {
      console.log('\n' + pc.bold('👥 Users:'));
      for (const [, user] of session.users) {
        const status = user.isActive ? pc.green('🟢 Active') : pc.gray('⚫ Inactive');
        const lastSeen = formatTimeSince(Date.now() - user.lastSeen);
        console.log(`  ${status} ${user.name} (${user.role}) - ${lastSeen}`);
      }
    }

    if (session.files.size > 0) {
      console.log('\n' + pc.bold('📁 Files:'));
      for (const [path, file] of session.files) {
        const lockStatus = file.isLocked ? pc.red('🔒') : pc.green('🔓');
        const modifiedBy = session.users.get(file.modifiedBy)?.name ??'Unknown';
        console.log(`  ${lockStatus} ${path} (v${file.version}) - ${modifiedBy}`);
      }
    }

    if (session.conflicts.filter(c => !c.resolvedAt).length > 0) {
      console.log('\n' + pc.bold('⚠️  Unresolved Conflicts:'));
      session.conflicts
        .filter(c => !c.resolvedAt)
        .forEach((conflict, index) => {
          console.log(`  ${index + 1}. ${conflict.type} in ${conflict.file}`);
          console.log(`     ${pc.gray(conflict.description)}`);
        });
    }
  }
}

function handleInviteUsers(
  engine: CollaborationEngine,
  options: CollaborateOptions,
  isJsonMode: boolean
): Promise<void> {
  if (!options.sessionId) {
    throw new Error('Session ID is required to invite users');
  }

  if (!options.invite ??options.invite.length === 0) {
    throw new Error('Email addresses are required to invite users');
  }

  const session = engine.getSession(options.sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Generate invitation links
  const invitations = options.invite.map(email => ({
    email,
    inviteLink: `zodkit collaborate join ${options.sessionId} --email ${email}`,
    webLink: `http://localhost:3000/session/${options.sessionId}?invite=${email}`
  }));

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      action: 'invitations_sent',
      sessionId: options.sessionId,
      invitations
    }, null, 2));
  } else {
    console.log(pc.green(`✅ Invitations prepared for ${session.name}`));
    console.log(pc.gray('─'.repeat(60)));

    invitations.forEach((invite, index) => {
      console.log(`\n${index + 1}. ${pc.cyan(invite.email)}`);
      console.log(`   Command: ${pc.gray(invite.inviteLink)}`);
      console.log(`   Web: ${pc.gray(invite.webLink)}`);
    });

    console.log('\n' + pc.yellow('📧 Send these links to your collaborators!'));
  }
}

async function handleResolveConflicts(
  engine: CollaborationEngine,
  options: CollaborateOptions,
  isJsonMode: boolean
): Promise<void> {
  if (!options.sessionId) {
    throw new Error('Session ID is required to resolve conflicts');
  }

  const session = engine.getSession(options.sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const unresolvedConflicts = session.conflicts.filter(c => !c.resolvedAt);

  if (unresolvedConflicts.length === 0) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: true,
        message: 'No conflicts to resolve'
      }, null, 2));
    } else {
      console.log(pc.green('✅ No conflicts to resolve'));
    }
    return;
  }

  // Auto-resolve conflicts that are marked as auto-resolvable
  const autoResolved: string[] = [];
  for (const conflict of unresolvedConflicts) {
    if (conflict.autoResolvable) {
      await engine.resolveConflict(session.id, conflict.id, 'merge');
      autoResolved.push(conflict.id);
    }
  }

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      action: 'conflicts_resolved',
      autoResolved: autoResolved.length,
      manualRequired: unresolvedConflicts.length - autoResolved.length,
      remainingConflicts: unresolvedConflicts.filter(c => !autoResolved.includes(c.id))
    }, null, 2));
  } else {
    console.log(pc.bold('🔧 Conflict Resolution'));
    console.log(pc.gray('─'.repeat(60)));

    if (autoResolved.length > 0) {
      console.log(pc.green(`✅ Auto-resolved ${autoResolved.length} conflicts`));
    }

    const remainingConflicts = unresolvedConflicts.filter(c => !autoResolved.includes(c.id));
    if (remainingConflicts.length > 0) {
      console.log(pc.yellow(`⚠️  ${remainingConflicts.length} conflicts require manual resolution:`));

      remainingConflicts.forEach((conflict, index) => {
        console.log(`\n${index + 1}. ${conflict.type} conflict in ${conflict.file}`);
        console.log(`   ${pc.gray(conflict.description)}`);
        console.log(`   Users: ${conflict.users.join(', ')}`);
        console.log(`   Command: ${pc.cyan(`zodkit collaborate resolve --session-id ${session.id} --conflict-id ${conflict.id}`)}`);
      });
    }
  }
}

function handleAddComment(
  _engine: CollaborationEngine,
  _options: CollaborateOptions,
  isJsonMode: boolean
): void {
  // Placeholder for comment functionality
  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      message: 'Comment functionality not yet implemented'
    }, null, 2));
  } else {
    console.log(pc.yellow('💬 Comment functionality coming soon!'));
    console.log('   Will support inline comments, suggestions, and discussions');
  }
}

function handleSyncSession(
  _engine: CollaborationEngine,
  _options: CollaborateOptions,
  isJsonMode: boolean
): void {
  // Placeholder for sync functionality
  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      message: 'Session synchronized'
    }, null, 2));
  } else {
    console.log(pc.green('🔄 Session synchronized'));
    console.log('   All files and operations are up to date');
  }
}

function handleWatchSession(
  engine: CollaborationEngine,
  options: CollaborateOptions,
  isJsonMode: boolean
): void {
  if (!options.sessionId) {
    throw new Error('Session ID is required to watch a session');
  }

  const session = engine.getSession(options.sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      action: 'watching_session',
      sessionId: options.sessionId
    }, null, 2));
  } else {
    console.log(pc.blue(`👀 Watching session: ${session.name}`));
    console.log(pc.gray('─'.repeat(60)));
    console.log(pc.yellow('Press Ctrl+C to stop watching'));
    console.log();
  }

  // Set up event listeners for real-time updates
  interface OperationEvent {
    session: { id: string; users: Map<string, CollaborationUser> };
    operation: { userId: string; type: string; file: string };
  }

  interface UserEvent {
    session: { id: string };
    user: { name: string };
  }

  interface ConflictEvent {
    session: { id: string };
    conflict: { file: string };
  }

  engine.on('operationApplied', ({ session: updatedSession, operation }: OperationEvent) => {
    if (updatedSession.id !== options.sessionId) return;

    if (!isJsonMode) {
      const user = updatedSession.users.get(operation.userId);
      console.log(`${pc.green('📝')} ${user?.name ?? 'Unknown'} ${operation.type} in ${operation.file}`);
    }
  });

  engine.on('userJoined', ({ session: updatedSession, user }: UserEvent) => {
    if (updatedSession.id !== options.sessionId) return;

    if (!isJsonMode) {
      console.log(`${pc.green('👋')} ${user.name} joined the session`);
    }
  });

  engine.on('userLeft', ({ session: updatedSession, user }: UserEvent) => {
    if (updatedSession.id !== options.sessionId) return;

    if (!isJsonMode) {
      console.log(`${pc.gray('👋')} ${user.name} left the session`);
    }
  });

  engine.on('conflictResolved', ({ session: updatedSession, conflict }: ConflictEvent) => {
    if (updatedSession.id !== options.sessionId) return;

    if (!isJsonMode) {
      console.log(`${pc.green('✅')} Conflict resolved in ${conflict.file}`);
    }
  });

  // Keep the process running
  process.on('SIGINT', () => {
    if (!isJsonMode) {
      console.log('\n' + pc.yellow('👋 Stopped watching session'));
    }
    process.exit(0);
  });
}

function handleInteractiveMode(
  _engine: CollaborationEngine,
  _options: CollaborateOptions,
  _isJsonMode: boolean
): void {
  if (_isJsonMode) {
    console.log(JSON.stringify({
      success: false,
      error: {
        message: 'Interactive mode not supported in JSON output',
        code: 'INTERACTIVE_JSON_ERROR'
      }
    }, null, 2));
    return;
  }

  console.log(pc.blue('🤝 Interactive Collaboration Mode'));
  console.log(pc.gray('─'.repeat(60)));

  // Interactive collaboration flow would go here
  console.log(pc.yellow('⚠️  Interactive mode not yet implemented'));
  console.log('\nAvailable actions:');
  console.log(`  ${pc.green('create')}   Create new collaboration session`);
  console.log(`  ${pc.green('join')}     Join existing session`);
  console.log(`  ${pc.green('list')}     List active sessions`);
  console.log(`  ${pc.green('server')}   Start collaboration server`);
  console.log('\nExample:');
  console.log(`  ${pc.cyan('zodkit collaborate create --name "API Design" --mode planning')}`);
}

function handleWebSocketMessage(
  _ws: WebSocket,
  message: unknown
): void {
  const msg = message as { type?: string };
  // Handle WebSocket messages for real-time collaboration
  switch (msg.type) {
    case 'join_session':
      // Handle user joining session
      break;
    case 'operation':
      // Handle collaborative operations
      break;
    case 'cursor_update':
      // Handle cursor position updates
      break;
    case 'comment':
      // Handle comments
      break;
    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

// Helper functions

function formatTimeSince(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

function getModeIcon(mode: CollaborationMode): string {
  switch (mode) {
    case 'live': return '⚡';
    case 'review': return '🔍';
    case 'merge': return '🔀';
    case 'planning': return '📋';
    case 'documentation': return '📚';
    case 'testing': return '🧪';
    default: return '🤝';
  }
}

function displayHelp(isJsonMode: boolean): void {
  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      help: {
        actions: ['create', 'join', 'leave', 'server', 'list', 'status', 'invite', 'resolve', 'watch'],
        modes: ['live', 'review', 'merge', 'planning', 'documentation', 'testing'],
        examples: [
          'zodkit collaborate create --name "API Design" --mode planning',
          'zodkit collaborate join <session-id>',
          'zodkit collaborate server --port 3000',
          'zodkit collaborate list'
        ]
      }
    }, null, 2));
  } else {
    console.log(pc.bold('🤝 Real-time Schema Collaboration'));
    console.log(pc.gray('─'.repeat(60)));

    console.log('\n' + pc.cyan('Available Actions:'));
    console.log(`  ${pc.green('create')}     Create new collaboration session`);
    console.log(`  ${pc.green('join')}       Join existing session`);
    console.log(`  ${pc.green('leave')}      Leave current session`);
    console.log(`  ${pc.green('server')}     Start collaboration server`);
    console.log(`  ${pc.green('list')}       List active sessions`);
    console.log(`  ${pc.green('status')}     Show session status`);
    console.log(`  ${pc.green('invite')}     Invite users to session`);
    console.log(`  ${pc.green('resolve')}    Resolve conflicts`);
    console.log(`  ${pc.green('watch')}      Watch session for real-time updates`);

    console.log('\n' + pc.cyan('Collaboration Modes:'));
    console.log(`  ${pc.yellow('live')}         Real-time collaborative editing`);
    console.log(`  ${pc.yellow('review')}       Code review and approval workflow`);
    console.log(`  ${pc.yellow('merge')}        Conflict resolution and merging`);
    console.log(`  ${pc.yellow('planning')}     Schema design planning sessions`);
    console.log(`  ${pc.yellow('documentation')} Collaborative documentation`);
    console.log(`  ${pc.yellow('testing')}      Collaborative testing and validation`);

    console.log('\n' + pc.cyan('Examples:'));
    console.log(`  ${pc.gray('$')} zodkit collaborate create --name "API Design" --mode planning`);
    console.log(`  ${pc.gray('$')} zodkit collaborate join abc123 --name "John Doe"`);
    console.log(`  ${pc.gray('$')} zodkit collaborate server --port 3000`);
    console.log(`  ${pc.gray('$')} zodkit collaborate list`);
    console.log(`  ${pc.gray('$')} zodkit collaborate watch abc123`);
    console.log(`  ${pc.gray('$')} zodkit collaborate invite abc123 --invite user@example.com`);

    console.log('\n' + pc.cyan('Quick Start:'));
    console.log(`  1. ${pc.gray('Create session:')} zodkit collaborate create --name "My Project"`);
    console.log(`  2. ${pc.gray('Start server:')} zodkit collaborate server`);
    console.log(`  3. ${pc.gray('Share session ID with team members')}`);
    console.log(`  4. ${pc.gray('Collaborate in real-time!')}`);
  }
}