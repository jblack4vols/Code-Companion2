import { describe, it, expect, vi } from "vitest";
import type { IStorage, PaginatedResult, PhysicianFilters, InteractionFilters, ReferralFilters } from "../../server/storage";
import type {
  User, InsertUser, Location, InsertLocation, Physician, InsertPhysician,
  Interaction, InsertInteraction, Referral, InsertReferral, Task, InsertTask,
  CalendarEvent, InsertCalendarEvent, AuditLog,
} from "@shared/schema";

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    password: "hashedpassword",
    role: "MARKETER",
    approvalStatus: "APPROVED",
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    forcePasswordChange: false,
    passwordResetToken: null,
    passwordResetExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "loc-1",
    name: "Main Clinic",
    address: "123 Main St",
    city: "Nashville",
    state: "TN",
    phone: "615-555-0100",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockStorage(overrides: Partial<IStorage> = {}): Partial<IStorage> {
  const mockUsers: User[] = [createMockUser()];
  const mockLocations: Location[] = [createMockLocation()];

  return {
    getUser: vi.fn(async (id: string) => mockUsers.find(u => u.id === id)),
    getUserByEmail: vi.fn(async (email: string) => mockUsers.find(u => u.email === email)),
    getUsers: vi.fn(async () => mockUsers),
    createUser: vi.fn(async (user: InsertUser) => createMockUser({ ...user, id: "user-new" })),
    updateUser: vi.fn(async (id: string, data: any) => {
      const user = mockUsers.find(u => u.id === id);
      if (!user) return undefined;
      return { ...user, ...data };
    }),
    deleteUser: vi.fn(async () => true),
    getLocations: vi.fn(async () => mockLocations),
    getLocation: vi.fn(async (id: string) => mockLocations.find(l => l.id === id)),
    createLocation: vi.fn(async (loc: InsertLocation) => createMockLocation({ ...loc, id: "loc-new" })),
    ...overrides,
  };
}

describe("Storage Interface (Mock)", () => {
  describe("User operations", () => {
    it("should retrieve a user by ID", async () => {
      const storage = createMockStorage();
      const user = await storage.getUser!("user-1");
      expect(user).toBeDefined();
      expect(user!.id).toBe("user-1");
      expect(user!.email).toBe("test@example.com");
    });

    it("should return undefined for non-existent user", async () => {
      const storage = createMockStorage();
      const user = await storage.getUser!("non-existent");
      expect(user).toBeUndefined();
    });

    it("should retrieve a user by email", async () => {
      const storage = createMockStorage();
      const user = await storage.getUserByEmail!("test@example.com");
      expect(user).toBeDefined();
      expect(user!.name).toBe("Test User");
    });

    it("should return undefined for non-existent email", async () => {
      const storage = createMockStorage();
      const user = await storage.getUserByEmail!("nobody@example.com");
      expect(user).toBeUndefined();
    });

    it("should list all users", async () => {
      const storage = createMockStorage();
      const users = await storage.getUsers!();
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe("test@example.com");
    });

    it("should create a new user", async () => {
      const storage = createMockStorage();
      const newUser = await storage.createUser!({
        name: "New User",
        email: "new@example.com",
        password: "hashed",
        role: "ANALYST",
      });
      expect(newUser.id).toBe("user-new");
      expect(newUser.name).toBe("New User");
      expect(storage.createUser).toHaveBeenCalledOnce();
    });

    it("should update an existing user", async () => {
      const storage = createMockStorage();
      const updated = await storage.updateUser!("user-1", { name: "Updated Name" });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe("Updated Name");
    });

    it("should return undefined when updating non-existent user", async () => {
      const storage = createMockStorage();
      const updated = await storage.updateUser!("non-existent", { name: "X" });
      expect(updated).toBeUndefined();
    });
  });

  describe("Location operations", () => {
    it("should list all locations", async () => {
      const storage = createMockStorage();
      const locations = await storage.getLocations!();
      expect(locations).toHaveLength(1);
      expect(locations[0].name).toBe("Main Clinic");
    });

    it("should retrieve a location by ID", async () => {
      const storage = createMockStorage();
      const location = await storage.getLocation!("loc-1");
      expect(location).toBeDefined();
      expect(location!.city).toBe("Nashville");
    });

    it("should return undefined for non-existent location", async () => {
      const storage = createMockStorage();
      const location = await storage.getLocation!("non-existent");
      expect(location).toBeUndefined();
    });

    it("should create a new location", async () => {
      const storage = createMockStorage();
      const newLoc = await storage.createLocation!({
        name: "Branch Office",
        address: "456 Oak Ave",
        city: "Memphis",
        state: "TN",
      });
      expect(newLoc.id).toBe("loc-new");
      expect(newLoc.name).toBe("Branch Office");
    });
  });

  describe("IStorage interface shape", () => {
    it("should have all core CRUD method signatures", () => {
      const storage = createMockStorage();
      expect(typeof storage.getUser).toBe("function");
      expect(typeof storage.getUserByEmail).toBe("function");
      expect(typeof storage.getUsers).toBe("function");
      expect(typeof storage.createUser).toBe("function");
      expect(typeof storage.updateUser).toBe("function");
      expect(typeof storage.deleteUser).toBe("function");
      expect(typeof storage.getLocations).toBe("function");
      expect(typeof storage.getLocation).toBe("function");
      expect(typeof storage.createLocation).toBe("function");
    });
  });
});
