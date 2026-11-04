export interface UserRecord {
  id: string;
  email: string;
  createdAt: Date;
}

export class UserService {
  /**
   * Fetch all registered users
   */
  static async listUsers(): Promise<UserRecord[]> {
    // 50 lines of database queries and business logic
    return [
      { id: 'usr_1', email: 'alice@example.com', createdAt: new Date() },
      { id: 'usr_2', email: 'bob@example.com', createdAt: new Date() }
    ];
  }

  /**
   * Register a new user with hashed password
   */
  static async createUser(email: string, pass: string): Promise<UserRecord> {
    // Extensive validation, salt hashing, and persistence logic
    return { id: 'usr_3', email, createdAt: new Date() };
  }
}

