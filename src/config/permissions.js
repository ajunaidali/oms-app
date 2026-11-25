export const PERMISSION_GROUPS = [
  {
    label: 'Employee',
    permissions: [
      'employee:create:own',
      'employee:create:scoped',
      'employee:create:any',
      'employee:read:own',
      'employee:read:scoped',
      'employee:read:any',
      'employee:update:own',
      'employee:update:scoped',
      'employee:update:any',
      'employee:delete:own',
      'employee:delete:scoped',
      'employee:delete:any',
    ],
  },
  {
    label: 'Department',
    permissions: [
      'department:create:own',
      'department:create:any',
      'department:read:own',
      'department:read:any',
      'department:update:own',
      'department:update:any',
      'department:delete:own',
      'department:delete:any',
    ],
  },
  {
    label: 'Position',
    permissions: [
      'position:create:own',
      'position:create:any',
      'position:read:own',
      'position:read:any',
      'position:update:own',
      'position:update:any',
      'position:delete:own',
      'position:delete:any',
    ],
  },
  {
    label: 'Assignment',
    permissions: [
      'assignment:create:own',
      'assignment:create:any',
      'assignment:read:own',
      'assignment:read:any',
      'assignment:update:own',
      'assignment:update:any',
      'assignment:delete:own',
      'assignment:delete:any',
    ],
  },
  {
    label: 'Role',
    permissions: [
      'role:create:own',
      'role:create:any',
      'role:read:own',
      'role:read:any',
      'role:update:own',
      'role:update:any',
      'role:delete:own',
      'role:delete:any',
    ],
  },
  {
    label: 'Attendance',
    permissions: [
      'attendance:create:any',
      'attendance:read:any',
      'attendance:read:own',
      'attendance:update:any',
    ],
  },
  {
    label: 'Ticket',
    permissions: [
      'ticket:create:own',
      'ticket:create:any',
      'ticket:read:own',
      'ticket:read:any',
      'ticket:update:own',
      'ticket:update:any',
      'ticket:delete:own',
      'ticket:delete:any',
    ],
  },
  {
    label: 'Task',
    permissions: [
      'task:create',
      'task:read',
      'task:read:own',
      'task:update',
      'task:update:own',
      'task:update:any',
      'task:delete',
    ],
  },
  {
    label: 'Project',
    permissions: [
      'project:create',
      'project:read:own',
      'project:read:any',
      'project:update',
      'project:delete',
    ],
  },
  {
    label: 'Salary',
    permissions: ['salary:create', 'salary:read', 'salary:update', 'salary:delete'],
  },
  {
    label: 'Leave',
    permissions: [
      'leave:create:own',
      'leave:create:any',
      'leave:read',
      'leave:read:own',
      'leave:read:any',
      'leave:update',
      'leave:update:own',
      'leave:delete',
      'leave:delete:own',
      'leave:balance:read',
      'leave:balance:update',
    ],
  },
  {
    label: 'Report / export / audit',
    permissions: ['report:read', 'export:read', 'audit:read', 'import:upload'],
  },
  {
    label: 'Notification',
    permissions: ['notification:create'],
  },
  {
    label: 'Asset',
    permissions: ['asset:create', 'asset:read', 'asset:update', 'asset:delete'],
  },
  {
    label: 'Resource',
    permissions: [
      'resource:create',
      'resource:read',
      'resource:read:scoped',
      'resource:update',
      'resource:renew',
      'resource:delete',
    ],
  },
  {
    label: 'Settings',
    permissions: ['settings:read', 'settings:update'],
  },
  {
    label: 'Feedback',
    permissions: [
      'feedback:create',
      'feedback:read',
      'feedback:read:own',
      'feedback:update',
      'feedback:delete:any',
    ],
  },
  {
    label: 'Todo',
    permissions: [
      'todo:create',
      'todo:read:own',
      'todo:update:own',
      'todo:delete:own',
    ],
  },
  {
    label: 'Studio Booking',
    permissions: [
      'studio-booking:read',
      'studio-booking:create',
      'studio-booking:approve',
      'studio-booking:cancel:own',
      'studio-booking:cancel:any',
    ],
  },
  {
    label: 'Email Templates',
    permissions: [
      'email-template:read',
      'email-template:update',
      'email-template:preview',
      'email-template:send-test',
    ],
  },
];

export const ATTENDANCE_LOG_ACCESS_PERMISSIONS = [
  'attendance:read:any',
];

export const ATTENDANCE_IMPORT_ACCESS_PERMISSIONS = [
  'import:upload',
  'attendance:create:any',
];

/** Employee/department pages — Super Admin sees all; create:own users see only records they created. */
export const EMPLOYEE_MANAGEMENT_ACCESS_PERMISSIONS = [
  'employee:read:any',
  'employee:read:scoped',
  'employee:create:any',
  'employee:create:own',
  'employee:create:scoped',
  'employee:create',
];

export const DEPARTMENT_MANAGEMENT_ACCESS_PERMISSIONS = [
  'department:read:any',
  'department:read:own',
  'department:read',
  'department:create:any',
  'department:create:own',
  'department:create',
];

export const POSITION_MANAGEMENT_ACCESS_PERMISSIONS = [
  'position:read:any',
  'position:read:own',
  'position:read',
  'position:create:any',
  'position:create:own',
  'position:create',
];

export const ASSIGNMENT_MANAGEMENT_ACCESS_PERMISSIONS = ['assignment:read:any'];

export const ROLE_MANAGEMENT_ACCESS_PERMISSIONS = ['role:read:any'];

export const SALARY_MANAGEMENT_ACCESS_PERMISSIONS = ['salary:read'];

export const LEAVE_BALANCE_ACCESS_PERMISSIONS = [
  'leave:balance:read',
  'leave:read:any',
];

export const NOTIFICATION_ACCESS_PERMISSIONS = ['notification:create'];

export const REPORT_ACCESS_PERMISSIONS = ['report:read', 'export:read'];

export const AUDIT_LOG_ACCESS_PERMISSIONS = ['audit:read'];

export const SETTINGS_ADMIN_ACCESS_PERMISSIONS = ['settings:read'];

export const UPLOADS_ACCESS_PERMISSIONS = ['import:upload'];

export const EMAIL_TEMPLATE_ACCESS_PERMISSIONS = ['email-template:read'];

export const RESOURCES_ACCESS_PERMISSIONS = [
  'resource:read',
  'resource:read:scoped',
];

export const ASSET_MANAGEMENT_ACCESS_PERMISSIONS = ['asset:read'];

/** Self-service pages — open only with read (own/any/base). */
export const LEAVES_SELF_SERVICE_PERMISSIONS = [
  'leave:read',
  'leave:read:own',
  'leave:read:any',
];

export const TICKETS_SELF_SERVICE_PERMISSIONS = [
  'ticket:read',
  'ticket:read:own',
  'ticket:read:any',
];

export const TASKS_SELF_SERVICE_PERMISSIONS = [
  'task:read',
  'task:read:own',
];

export const PROJECT_SELF_SERVICE_PERMISSIONS = [
  'project:read',
  'project:read:own',
  'project:read:any',
];

export const PROJECT_MANAGEMENT_ACCESS_PERMISSIONS = [
  'project:read:any',
  'project:create',
  'project:update',
  'project:delete',
];

export const ATTENDANCE_SELF_SERVICE_PERMISSIONS = [
  'attendance:read:own',
  'attendance:read:any',
];

export const ATTENDANCE_MANAGEMENT_ACCESS_PERMISSIONS = [
  'attendance:read:any',
  'attendance:create:any',
  'attendance:update:any',
];

export const STUDIO_BOOKING_ACCESS_PERMISSIONS = ['studio-booking:read'];

export const TODO_ACCESS_PERMISSIONS = ['todo:read:own'];

export const FEEDBACK_ACCESS_PERMISSIONS = [
  'feedback:read',
  'feedback:read:own',
];

export const PERMISSION_LABELS = {
  'employee:create': 'Create employee',
  'employee:create:own': 'Create own employee',
  'employee:create:scoped': 'Create employees (scoped)',
  'employee:create:any': 'Create employee (any)',
  'employee:read': 'Read employee records',
  'employee:read:own': 'Read own employee record',
  'employee:read:scoped': 'Read employee records (scoped)',
  'employee:read:any': 'Read employee records (any)',
  'employee:update': 'Update employee records',
  'employee:update:own': 'Update own employee record',
  'employee:update:scoped': 'Update employee records (scoped)',
  'employee:update:any': 'Update employee records (any)',
  'employee:delete': 'Delete employee records',
  'employee:delete:own': 'Delete own employee record',
  'employee:delete:scoped': 'Delete employee records (scoped)',
  'employee:delete:any': 'Delete employee records (any)',
  'department:create': 'Create departments',
  'department:create:own': 'Create own departments',
  'department:create:any': 'Create departments (any)',
  'department:read': 'Read departments',
  'department:read:own': 'Read own departments',
  'department:read:any': 'Read departments (any)',
  'department:update': 'Update departments',
  'department:update:own': 'Update own departments',
  'department:update:any': 'Update departments (any)',
  'department:delete': 'Delete departments',
  'department:delete:own': 'Delete own departments',
  'department:delete:any': 'Delete departments (any)',
  'position:create': 'Create positions',
  'position:create:own': 'Create own positions',
  'position:create:any': 'Create positions (any)',
  'position:read': 'Read positions',
  'position:read:own': 'Read own positions',
  'position:read:any': 'Read positions (any)',
  'position:update': 'Update positions',
  'position:update:own': 'Update own positions',
  'position:update:any': 'Update positions (any)',
  'position:delete': 'Delete positions',
  'position:delete:own': 'Delete own positions',
  'position:delete:any': 'Delete positions (any)',
  'assignment:create': 'Create assignments',
  'assignment:create:own': 'Create own assignments',
  'assignment:create:any': 'Create assignments (any)',
  'assignment:read': 'Read assignments',
  'assignment:read:own': 'Read own assignments',
  'assignment:read:any': 'Read assignments (any)',
  'assignment:update': 'Update assignments',
  'assignment:update:own': 'Update own assignments',
  'assignment:update:any': 'Update assignments (any)',
  'assignment:delete': 'Delete assignments',
  'assignment:delete:own': 'Delete own assignments',
  'assignment:delete:any': 'Delete assignments (any)',
  'role:create': 'Create roles',
  'role:create:own': 'Create own roles',
  'role:create:any': 'Create roles (any)',
  'role:read': 'Read roles',
  'role:read:own': 'Read own roles',
  'role:read:any': 'Read roles (any)',
  'role:update': 'Update roles',
  'role:update:own': 'Update own roles',
  'role:update:any': 'Update roles (any)',
  'role:delete': 'Delete roles',
  'role:delete:own': 'Delete own roles',
  'role:delete:any': 'Delete roles (any)',
  'attendance:create:any': 'Manual mark / manage others',
  'attendance:read:any': 'Read all attendance',
  'attendance:read:own': 'Own attendance',
  'attendance:update:any': 'Update / import / justify review',
  'ticket:create': 'Create tickets',
  'ticket:create:own': 'Create own tickets',
  'ticket:create:any': 'Create tickets (any)',
  'ticket:read': 'Read tickets',
  'ticket:read:own': 'Read own tickets',
  'ticket:read:any': 'Read all tickets',
  'ticket:update': 'Update tickets',
  'ticket:update:own': 'Update own tickets',
  'ticket:update:any': 'Update tickets (any)',
  'ticket:delete': 'Delete tickets',
  'ticket:delete:own': 'Delete own tickets',
  'ticket:delete:any': 'Delete tickets (any)',
  'task:create': 'Create tasks',
  'task:read': 'Read tasks',
  'task:read:own': 'Read own tasks',
  'task:update': 'Update tasks',
  'task:update:own': 'Update own tasks',
  'task:update:any': 'Update tasks (any)',
  'task:delete': 'Delete tasks',
  'project:create': 'Create projects',
  'project:read': 'Read projects (base)',
  'project:read:own': 'Read own assigned projects',
  'project:read:any': 'Read all projects (HR/admin)',
  'project:update': 'Update projects',
  'project:delete': 'Delete projects',
  'salary:create': 'Create salary records',
  'salary:read': 'Read salary records',
  'salary:update': 'Update salary records',
  'salary:delete': 'Delete salary records',
  'leave:create': 'Create leave requests',
  'leave:create:own': 'Create own leave requests',
  'leave:create:any': 'Create leave requests (any)',
  'leave:read': 'Read leave requests',
  'leave:read:own': 'Read own leave requests',
  'leave:read:any': 'Read all leave requests',
  'leave:update': 'Update leave requests',
  'leave:update:own': 'Update own leave requests',
  'leave:delete': 'Delete leave requests',
  'leave:delete:own': 'Delete own leave requests',
  'leave:balance:read': 'View leave balances (HR)',
  'leave:balance:update': 'Manage leave quotas (HR)',
  'report:read': 'Read reports',
  'export:read': 'Export data (also accepted via report:read)',
  'audit:read': 'Read audit logs',
  'import:upload': 'Upload imports (role map; routes mainly check attendance)',
  'notification:create': 'Admin send/bulk (users can still read own inbox)',
  'asset:create': 'Create assets',
  'asset:read': 'Read assets',
  'asset:update': 'Update assets',
  'asset:delete': 'Delete assets',
  'resource:create': 'Create resources',
  'resource:read': 'All resources',
  'resource:read:scoped': 'Own dept tree / assigned',
  'resource:update': 'Update resources',
  'resource:renew': 'Renew resources',
  'resource:delete': 'Delete resources',
  'settings:read': 'Read settings',
  'settings:update': 'Update settings',
  'feedback:create': 'Create feedback',
  'feedback:read': 'Read feedback',
  'feedback:read:own': 'Read own feedback',
  'feedback:update': 'Update feedback',
  'feedback:delete:any': 'Delete any feedback',
  'todo:create': 'Create todos (user-scoped)',
  'todo:read:own': 'Read own todos',
  'todo:update:own': 'Update own todos',
  'todo:delete:own': 'Delete own todos',
  'studio-booking:read': 'View studio booking calendar',
  'studio-booking:create': 'Book studio days',
  'studio-booking:approve': 'Approve or reject podcast bookings',
  'studio-booking:cancel:own': 'Cancel own studio bookings',
  'studio-booking:cancel:any': 'Cancel any studio booking',
  'email-template:read': 'Read email templates',
  'email-template:update': 'Update email templates',
  'email-template:preview': 'Preview email templates',
  'email-template:send-test': 'Send test emails',
};

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.permissions);
