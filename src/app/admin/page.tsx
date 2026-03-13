"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  Building,
  Users,
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  Shield,
  MapPin,
  DollarSign,
  TrendingUp,
  Settings,
  Clock,
  Package,
  BarChart3,
  Star,
  Calendar,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

interface Organization {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  is_verified: boolean;
  created_at: string;
  password?: string;
  role: string;
  status: "active" | "inactive" | "pending";
  funding: string;
  region: string;
  volunteer_count: number;
  supplies?: {
    medical: number;
    food: number;
    water: number;
    shelter: number;
    equipment: number;
  };
}

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  created_at: string;
  is_admin?: boolean;
  total_points?: number;
  role: "user" | "tracking_volunteer" | "supply_volunteer" | "organization" | "admin";
  status: "active" | "inactive";
  last_login?: string;
}

export default function AdminPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [userFilter, setUserFilter] = useState<
    "all" | "tracking_volunteer" | "user" | "organization" | "admin"
  >("all");
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const [deleteOrgId, setDeleteOrgId] = useState<string | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [newOrg, setNewOrg] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    password: "",
    region: "",
    funding: "",
    status: "pending" as "active" | "inactive" | "pending",
  });
  const [editUserData, setEditUserData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "user" as PlatformUser["role"],
    is_admin: false,
  });
  const [loading, setLoading] = useState(true);
  const [isRegisteringOrg, setIsRegisteringOrg] = useState(false);
  const [isUpdatingOrg, setIsUpdatingOrg] = useState(false);
  const [isDeletingOrg, setIsDeletingOrg] = useState(false);
  const [approvingOrgId, setApprovingOrgId] = useState<string | null>(null);
  const [rejectingOrgId, setRejectingOrgId] = useState<string | null>(null);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteOrgDialogOpen, setDeleteOrgDialogOpen] = useState(false);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);

  // Redirect non-admin users
  useEffect(() => {
    if (user && user.role !== "admin") {
      window.location.href = "/";
    }
  }, [user]);

  // Fetch organizations from Supabase with volunteer counts
  const fetchOrganizations = async () => {
    try {
      const { data: orgsData, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (orgsError) {
        console.error('Error fetching organizations:', orgsError);
        return;
      }

      if (orgsData) {
        // Fetch volunteer counts for each organization
        const organizationsWithVolunteers = await Promise.all(
          orgsData.map(async (org) => {
            const { count, error: volunteerError } = await supabase
              .from('org-member')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', org.id)
              .eq('status', 'active');

            if (volunteerError) {
              console.error('Error fetching volunteer count for org:', org.id, volunteerError);
              return {
                ...org,
                volunteer_count: 0,
                status: (org.status as "active" | "inactive" | "pending") || "pending",
                funding: org.funding || "$0",
                region: org.region || "Unknown",
                contactEmail: org.email,
                contactPhone: org.phone,
                username: org.email.split('@')[0],
                supplies: {
                  medical: Math.floor(Math.random() * 300),
                  food: Math.floor(Math.random() * 1200),
                  water: Math.floor(Math.random() * 1500),
                  shelter: Math.floor(Math.random() * 100),
                  equipment: Math.floor(Math.random() * 400),
                }
              };
            }

            return {
              ...org,
              volunteer_count: count || 0,
              status: (org.status as "active" | "inactive" | "pending") || "pending",
              funding: org.funding || "$0",
              region: org.region || "Unknown",
              contactEmail: org.email,
              contactPhone: org.phone,
              username: org.email.split('@')[0],
              supplies: {
                medical: Math.floor(Math.random() * 300),
                food: Math.floor(Math.random() * 1200),
                water: Math.floor(Math.random() * 1500),
                shelter: Math.floor(Math.random() * 100),
                equipment: Math.floor(Math.random() * 400),
              }
            };
          })
        );

        setOrganizations(organizationsWithVolunteers);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
    }
  };

  // Fetch total volunteer count across all organizations
  const fetchTotalVolunteers = async (): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from('org-member')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching total volunteers:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error fetching total volunteers:', error);
      return 0;
    }
  };

  // Fetch users from Supabase - Synchronized with database schema
  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching users:', error);
        return;
      }

      if (data) {
        // Map database fields to PlatformUser interface
        const mappedUsers: PlatformUser[] = data.map(dbUser => ({
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email || '',
          phone: dbUser.phone || '',
          password: dbUser.password,
          created_at: dbUser.created_at,
          is_admin: dbUser.is_admin || false,
          total_points: dbUser.total_points || 0,
          // Map is_admin to role - you can expand this logic based on your needs
          role: dbUser.is_admin ? 'admin' : 'user',
          status: "active", // Default status
          last_login: dbUser.last_login
        }));
        
        setPlatformUsers(mappedUsers);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setPlatformUsers([]);
    }
  };

  // Load data on component mount
  useEffect(() => {
    if (user && user.role === "admin") {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchOrganizations(), fetchUsers()]);
    setLoading(false);
  };

  const handleRegisterOrganization = async () => {
    if (!newOrg.name || !newOrg.email || !newOrg.phone || !newOrg.region) {
      alert(t('admin.fillRequired'));
      return;
    }

    setIsRegisteringOrg(true);

    try {
      const { data, error } = await supabase
        .from('organizations')
        .insert([
          {
            name: newOrg.name,
            email: newOrg.email,
            phone: newOrg.phone,
            address: newOrg.address,
            password: newOrg.password,
            region: newOrg.region,
            funding: newOrg.funding || "$0",
            volunteer_count: 0,
            status: newOrg.status,
            role: 'organization'
          }
        ])
        .select();

      if (error) {
        console.error('Error creating organization:', error);
        alert(t('admin.createError') + ': ' + error.message);
        return;
      }

      if (data) {
        setOrganizations(prev => [{
          ...data[0],
          status: newOrg.status,
          volunteer_count: 0,
          funding: newOrg.funding || "$0",
          contactEmail: newOrg.email,
          contactPhone: newOrg.phone,
          username: newOrg.email.split('@')[0],
          supplies: {
            medical: 0,
            food: 0,
            water: 0,
            shelter: 0,
            equipment: 0,
          }
        }, ...prev]);
        
        setNewOrg({
          name: "",
          email: "",
          phone: "",
          address: "",
          password: "",
          region: "",
          funding: "",
          status: "pending",
        });
        alert(t('admin.createSuccess'));
      }
    } catch (error) {
      console.error('Error creating organization:', error);
      alert(t('admin.createError'));
    } finally {
      setIsRegisteringOrg(false);
    }
  };

  const handleUpdateOrganization = async () => {
    if (!editingOrg) return;

    setIsUpdatingOrg(true);

    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: newOrg.name,
          email: newOrg.email,
          phone: newOrg.phone,
          address: newOrg.address,
          password: newOrg.password,
          region: newOrg.region,
          funding: newOrg.funding,
          status: newOrg.status,
        })
        .eq('id', editingOrg.id);

      if (error) {
        console.error('Error updating organization:', error);
        alert(t('admin.updateError') + ': ' + error.message);
        return;
      }

      setOrganizations(prev =>
        prev.map((org) =>
          org.id === editingOrg.id
            ? {
                ...org,
                ...newOrg,
                contactEmail: newOrg.email,
                contactPhone: newOrg.phone,
                username: newOrg.email.split('@')[0],
              }
            : org
        )
      );

      setEditingOrg(null);
      setEditDialogOpen(false);
      setNewOrg({
        name: "",
        email: "",
        phone: "",
        address: "",
        password: "",
        region: "",
        funding: "",
        status: "pending",
      });
      alert(t('admin.updateSuccess'));
    } catch (error) {
      console.error('Error updating organization:', error);
      alert(t('admin.updateError'));
    } finally {
      setIsUpdatingOrg(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!deleteOrgId) return;

    setIsDeletingOrg(true);

    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', deleteOrgId);

      if (error) {
        console.error('Error deleting organization:', error);
        alert('Error deleting organization: ' + error.message);
        return;
      }

      setOrganizations(prev => prev.filter((org) => org.id !== deleteOrgId));
      setDeleteOrgId(null);
      setDeleteOrgDialogOpen(false);
      alert('Organization deleted successfully!');
    } catch (error) {
      console.error('Error deleting organization:', error);
      alert('Error deleting organization');
    } finally {
      setIsDeletingOrg(false);
    }
  };

  const handleApproveOrganization = async (orgId: string) => {
    setApprovingOrgId(orgId);

    try {
      const { error } = await supabase
        .from('organizations')
        .update({ status: 'active' })
        .eq('id', orgId);

      if (error) {
        console.error('Error approving organization:', error);
        alert('Error approving organization: ' + error.message);
        return;
      }

      setOrganizations(prev =>
        prev.map((org) =>
          org.id === orgId ? { ...org, status: "active" } : org
        )
      );
      alert('Organization approved successfully!');
    } catch (error) {
      console.error('Error approving organization:', error);
      alert('Error approving organization');
    } finally {
      setApprovingOrgId(null);
    }
  };

  const handleRejectOrganization = async (orgId: string) => {
    setRejectingOrgId(orgId);

    try {
      const { error } = await supabase
        .from('organizations')
        .update({ status: 'inactive' })
        .eq('id', orgId);

      if (error) {
        console.error('Error rejecting organization:', error);
        alert('Error rejecting organization: ' + error.message);
        return;
      }

      setOrganizations(prev =>
        prev.map((org) =>
          org.id === orgId ? { ...org, status: "inactive" } : org
        )
      );
      alert('Organization rejected successfully!');
    } catch (error) {
      console.error('Error rejecting organization:', error);
      alert('Error rejecting organization');
    } finally {
      setRejectingOrgId(null);
    }
  };

  // User management functions - Synchronized with database
  const handleEditUser = (user: PlatformUser) => {
    setEditingUser(user);
    setEditUserData({
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      role: user.role,
      is_admin: user.is_admin || false,
    });
    setEditUserDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    setIsUpdatingUser(true);

    try {
      const updateData: any = {
        name: editUserData.name,
        email: editUserData.email,
        phone: editUserData.phone,
        is_admin: editUserData.role === 'admin',
      };

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', editingUser.id);

      if (error) {
        console.error('Error updating user:', error);
        alert('Error updating user: ' + error.message);
        return;
      }

      setPlatformUsers(prev =>
        prev.map((user) =>
          user.id === editingUser.id ? { 
            ...user, 
            name: editUserData.name,
            email: editUserData.email,
            phone: editUserData.phone,
            role: editUserData.role,
            is_admin: editUserData.role === 'admin'
          } : user
        )
      );

      setEditingUser(null);
      setEditUserDialogOpen(false);
      setEditUserData({
        name: "",
        email: "",
        phone: "",
        role: "user",
        is_admin: false,
      });
      alert('User updated successfully!');
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error updating user');
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;

    setIsDeletingUser(true);

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', deleteUserId);

      if (error) {
        console.error('Error deleting user:', error);
        alert('Error deleting user: ' + error.message);
        return;
      }

      setPlatformUsers(prev => prev.filter((user) => user.id !== deleteUserId));
      setDeleteUserId(null);
      setDeleteUserDialogOpen(false);
      alert('User deleted successfully!');
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error deleting user');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "inactive":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-red-100 text-red-800";
      case "tracking_volunteer":
        return "bg-green-100 text-green-800";
      case "supply_volunteer":
        return "bg-blue-100 text-blue-800";
      case "organization":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Calculate stats from actual data
  const activeOrganizations = organizations.filter(
    (org) => org.status === "active"
  ).length;
  const pendingOrganizations = organizations.filter(
    (org) => org.status === "pending"
  ).length;
  
  // Calculate total volunteers from org_member table
  const [totalVolunteers, setTotalVolunteers] = useState(0);
  const totalFunding = organizations.reduce((sum, org) => {
    const amount = parseInt(org.funding?.replace(/[^0-9]/g, "") || "0");
    return sum + amount;
  }, 0);

  // Fetch total volunteer count when organizations change
  useEffect(() => {
    const loadTotalVolunteers = async () => {
      const count = await fetchTotalVolunteers();
      setTotalVolunteers(count);
    };
    
    if (organizations.length > 0) {
      loadTotalVolunteers();
    }
  }, [organizations]);

  // Prepare chart data
  const regionData = organizations.reduce((acc, org) => {
    const existing = acc.find((item) => item.region === org.region);
    if (existing) {
      existing.organizations += 1;
      existing.volunteers += org.volunteer_count || 0;
    } else {
      acc.push({
        region: org.region || "Unknown",
        organizations: 1,
        volunteers: org.volunteer_count || 0,
      });
    }
    return acc;
  }, [] as { region: string; organizations: number; volunteers: number }[]);

  const statusData = [
    { name: "Active", value: activeOrganizations, color: "#10b981" },
    { name: "Pending", value: pendingOrganizations, color: "#f59e0b" },
    {
      name: "Inactive",
      value: organizations.filter((org) => org.status === "inactive").length,
      color: "#ef4444",
    },
  ];

  const suppliesData = organizations.reduce(
    (acc, org) => {
      if (org.supplies) {
        acc.medical += org.supplies.medical;
        acc.food += org.supplies.food;
        acc.water += org.supplies.water;
        acc.shelter += org.supplies.shelter;
        acc.equipment += org.supplies.equipment;
      }
      return acc;
    },
    { medical: 0, food: 0, water: 0, shelter: 0, equipment: 0 }
  );

  const suppliesChartData = [
    { name: "Medical", value: suppliesData.medical, color: "#ef4444" },
    { name: "Food", value: suppliesData.food, color: "#f59e0b" },
    { name: "Water", value: suppliesData.water, color: "#3b82f6" },
    { name: "Shelter", value: suppliesData.shelter, color: "#10b981" },
    { name: "Equipment", value: suppliesData.equipment, color: "#8b5cf6" },
  ];

  const volunteerTrendData = organizations.map((org) => ({
    name: org.name,
    volunteers: org.volunteer_count || 0,
    funding: parseInt(org.funding?.replace(/[^0-9]/g, "") || "0"),
  }));

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Alert className="max-w-md">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Access denied. Admin privileges required.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {t("admin.title")}
          </h1>
          <p className="text-gray-600">
            Manage organizations and monitor platform activity
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Active Organizations
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {activeOrganizations}
                  </p>
                </div>
                <Building className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Pending Approval
                  </p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {pendingOrganizations}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Total Volunteers
                  </p>
                  <p className="text-2xl font-bold text-blue-600">
                    {totalVolunteers}
                  </p>
                </div>
                <Users className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Total Funding
                  </p>
                  <p className="text-2xl font-bold text-purple-600">
                    Ks {totalFunding.toLocaleString()}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="organizations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 h-auto p-2">
            <TabsTrigger
              value="organizations"
              className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3"
            >
              <Building className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">{t("admin.manageOrgs")}</span>
              <span className="xs:hidden">Orgs</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Users className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">Manage Users</span>
              <span className="xs:hidden">Users</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">Analytics</span>
              <span className="xs:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="register" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">{t("admin.registerOrg")}</span>
              <span className="xs:hidden">Add</span>
            </TabsTrigger>
          </TabsList>

          {/* Organizations Management */}
          <TabsContent value="organizations" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="w-5 h-5 text-blue-500" />
                      {t("admin.manageOrgs")}
                    </CardTitle>
                    <CardDescription>
                      View and manage all registered organizations
                    </CardDescription>
                  </div>
                  <Button onClick={loadData} variant="outline" size="sm" isLoading={loading}>
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Volunteers</TableHead>
                      <TableHead>Funding(Ks)</TableHead>
                      <TableHead>Supplies</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          No organizations found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      organizations.map((org) => (
                        <TableRow key={org.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{org.name}</div>
                              <div className="text-sm text-gray-500">
                                {org.email}
                              </div>
                              <div className="text-xs text-gray-400">
                                {org.phone}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4 text-gray-500" />
                              {org.region || "Unknown"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4 text-gray-500" />
                              {org.volunteer_count || 0}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4 text-gray-500" />
                              {org.funding || "0"}
                            </div>
                          </TableCell>
                          <TableCell>
                            {org.supplies ? (
                              <div className="flex flex-col gap-1 text-xs">
                                <div className="flex items-center gap-1">
                                  <Package className="w-3 h-3 text-red-500" />
                                  <span>Med: {org.supplies.medical}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Package className="w-3 h-3 text-orange-500" />
                                  <span>Food: {org.supplies.food}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Package className="w-3 h-3 text-blue-500" />
                                  <span>Water: {org.supplies.water}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Package className="w-3 h-3 text-green-500" />
                                  <span>Shelter: {org.supplies.shelter}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Package className="w-3 h-3 text-purple-500" />
                                  <span>Equip: {org.supplies.equipment}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(org.status)}>
                              {org.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {org.status === "pending" && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      handleApproveOrganization(org.id)
                                    }
                                    isLoading={approvingOrgId === org.id}
                                    loadingText=""
                                    disabled={approvingOrgId === org.id}
                                  >
                                    <Check className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleRejectOrganization(org.id)
                                    }
                                    isLoading={rejectingOrgId === org.id}
                                    loadingText=""
                                    disabled={rejectingOrgId === org.id}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                              
                              <Dialog open={editDialogOpen && editingOrg?.id === org.id} onOpenChange={setEditDialogOpen}>
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingOrg(org);
                                      setNewOrg({
                                        name: org.name,
                                        email: org.email,
                                        phone: org.phone,
                                        address: org.address || "",
                                        password: org.password || "",
                                        region: org.region || "",
                                        funding: org.funding || "",
                                        status: org.status,
                                      });
                                      setEditDialogOpen(true);
                                    }}
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle>Edit Organization</DialogTitle>
                                  </DialogHeader>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-4">
                                      <div>
                                        <Label htmlFor="edit-org-name">Organization Name *</Label>
                                        <Input
                                          id="edit-org-name"
                                          value={newOrg.name}
                                          onChange={(e) =>
                                            setNewOrg(prev => ({
                                              ...prev,
                                              name: e.target.value
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-org-email">Email *</Label>
                                        <Input
                                          id="edit-org-email"
                                          type="email"
                                          value={newOrg.email}
                                          onChange={(e) =>
                                            setNewOrg(prev => ({
                                              ...prev,
                                              email: e.target.value
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-org-phone">Phone *</Label>
                                        <Input
                                          id="edit-org-phone"
                                          value={newOrg.phone}
                                          onChange={(e) =>
                                            setNewOrg(prev => ({
                                              ...prev,
                                              phone: e.target.value
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-org-password">Password</Label>
                                        <Input
                                          id="edit-org-password"
                                          type="password"
                                          value={newOrg.password}
                                          onChange={(e) =>
                                            setNewOrg(prev => ({
                                              ...prev,
                                              password: e.target.value
                                            }))
                                          }
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-4">
                                      <div>
                                        <Label htmlFor="edit-org-region">Region *</Label>
                                        <Select
                                          value={newOrg.region}
                                          onValueChange={(value) =>
                                            setNewOrg(prev => ({
                                              ...prev,
                                              region: value
                                            }))
                                          }
                                        >
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="Yangon">Yangon</SelectItem>
                                            <SelectItem value="Mandalay">Mandalay</SelectItem>
                                            <SelectItem value="Naypyidaw">Naypyidaw</SelectItem>
                                            <SelectItem value="Sagaing">Sagaing</SelectItem>
                                            <SelectItem value="Bago">Bago</SelectItem>
                                            <SelectItem value="Magway">Magway</SelectItem>
                                            <SelectItem value="Tanintharyi">Tanintharyi</SelectItem>
                                            <SelectItem value="Ayeyarwady">Ayeyarwady</SelectItem>
                                            <SelectItem value="Kachin">Kachin</SelectItem>
                                            <SelectItem value="Kayah">Kayah</SelectItem>
                                            <SelectItem value="Kayin">Kayin</SelectItem>
                                            <SelectItem value="Chin">Chin</SelectItem>
                                            <SelectItem value="Mon">Mon</SelectItem>
                                            <SelectItem value="Rakhine">Rakhine</SelectItem>
                                            <SelectItem value="Shan">Shan</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-org-status">Status</Label>
                                        <Select
                                          value={newOrg.status}
                                          onValueChange={(value: "active" | "inactive" | "pending") =>
                                            setNewOrg(prev => ({
                                              ...prev,
                                              status: value
                                            }))
                                          }
                                        >
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="pending">Pending</SelectItem>
                                            <SelectItem value="inactive">Inactive</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-org-funding">Funding</Label>
                                        <Input
                                          id="edit-org-funding"
                                          value={newOrg.funding}
                                          onChange={(e) =>
                                            setNewOrg(prev => ({
                                              ...prev,
                                              funding: e.target.value
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-org-address">Address</Label>
                                        <Input
                                          id="edit-org-address"
                                          value={newOrg.address}
                                          onChange={(e) =>
                                            setNewOrg(prev => ({
                                              ...prev,
                                              address: e.target.value
                                            }))
                                          }
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button
                                      variant="outline"
                                      disabled={isUpdatingOrg}
                                      onClick={() => {
                                        setEditingOrg(null);
                                        setEditDialogOpen(false);
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                    <Button onClick={handleUpdateOrganization} isLoading={isUpdatingOrg}>
                                      Update Organization
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>

                              <Dialog open={deleteOrgDialogOpen && deleteOrgId === org.id} onOpenChange={setDeleteOrgDialogOpen}>
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => {
                                      setDeleteOrgId(org.id);
                                      setDeleteOrgDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Delete Organization</DialogTitle>
                                    <DialogDescription>
                                      Are you sure you want to delete {org.name}? This action cannot be undone.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <DialogFooter>
                                    <Button
                                      variant="outline"
                                      disabled={isDeletingOrg}
                                      onClick={() => {
                                        setDeleteOrgId(null);
                                        setDeleteOrgDialogOpen(false);
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      onClick={handleDeleteOrganization}
                                      isLoading={isDeletingOrg}
                                    >
                                      Delete
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manage Users - Synchronized with Database */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-500" />
                      Manage Users
                    </CardTitle>
                    <CardDescription>
                      View and manage all platform users - Synchronized with Database
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-filter" className="text-sm">
                      Filter by Role:
                    </Label>
                    <Select
                      value={userFilter}
                      onValueChange={(
                        value: "all" | "tracking_volunteer" | "user" | "organization" | "admin"
                      ) => setUserFilter(value)}
                    >
                      <SelectTrigger id="user-filter" className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        <SelectItem value="admin">Admins</SelectItem>
                        <SelectItem value="tracking_volunteer">
                          Tracker Volunteers
                        </SelectItem>
                        <SelectItem value="user">Regular Users</SelectItem>
                        <SelectItem value="organization">Organizations</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={loadData} variant="outline" size="sm" isLoading={loading}>
                      Refresh
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {platformUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                          No users found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      platformUsers
                        .filter((user) => {
                          if (userFilter === "all") return true;
                          return user.role === userFilter;
                        })
                        .map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{user.name}</div>
                                <div className="text-sm text-gray-500">
                                  {user.email}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <div className="text-sm">{user.email}</div>
                                {user.phone && (
                                  <div className="text-sm text-gray-500">
                                    {user.phone}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={getRoleColor(user.role)}>
                                {user.role === "admin"
                                  ? "Admin"
                                  : user.role === "tracking_volunteer"
                                  ? "Tracker Volunteer"
                                  : user.role === "supply_volunteer"
                                  ? "Supply Volunteer"
                                  : user.role === "organization"
                                  ? "Organization"
                                  : "User"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Star className="w-4 h-4 text-yellow-500" />
                                <span className="font-medium">{user.total_points || 0}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-sm text-gray-500">
                                <Calendar className="w-4 h-4" />
                                {new Date(user.created_at).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Dialog open={editUserDialogOpen && editingUser?.id === user.id} onOpenChange={setEditUserDialogOpen}>
                                  <DialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleEditUser(user)}
                                    >
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Edit User</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div>
                                        <Label htmlFor="edit-user-name">Name</Label>
                                        <Input
                                          id="edit-user-name"
                                          value={editUserData.name}
                                          onChange={(e) =>
                                            setEditUserData(prev => ({
                                              ...prev,
                                              name: e.target.value
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-user-email">Email</Label>
                                        <Input
                                          id="edit-user-email"
                                          type="email"
                                          value={editUserData.email}
                                          onChange={(e) =>
                                            setEditUserData(prev => ({
                                              ...prev,
                                              email: e.target.value
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-user-phone">Phone</Label>
                                        <Input
                                          id="edit-user-phone"
                                          value={editUserData.phone}
                                          onChange={(e) =>
                                            setEditUserData(prev => ({
                                              ...prev,
                                              phone: e.target.value
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-user-role">Role</Label>
                                        <Select
                                          value={editUserData.role}
                                          onValueChange={(value: PlatformUser["role"]) =>
                                            setEditUserData(prev => ({
                                              ...prev,
                                              role: value,
                                              is_admin: value === 'admin'
                                            }))
                                          }
                                        >
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="user">User</SelectItem>
                                            <SelectItem value="admin">Admin</SelectItem>
                                            <SelectItem value="tracking_volunteer">
                                              Tracking Volunteer
                                            </SelectItem>
                                            <SelectItem value="supply_volunteer">
                                              Supply Volunteer
                                            </SelectItem>
                                            <SelectItem value="organization">
                                              Organization
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                    <DialogFooter>
                                      <Button
                                        variant="outline"
                                        disabled={isUpdatingUser}
                                        onClick={() => {
                                          setEditingUser(null);
                                          setEditUserDialogOpen(false);
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                      <Button onClick={handleUpdateUser} isLoading={isUpdatingUser}>
                                        Update User
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>

                                <Dialog open={deleteUserDialogOpen && deleteUserId === user.id} onOpenChange={setDeleteUserDialogOpen}>
                                  <DialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => {
                                        setDeleteUserId(user.id);
                                        setDeleteUserDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Delete User</DialogTitle>
                                      <DialogDescription>
                                        Are you sure you want to delete {user.name}? This action cannot be undone.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                      <Button
                                        variant="outline"
                                        disabled={isDeletingUser}
                                        onClick={() => {
                                          setDeleteUserId(null);
                                          setDeleteUserDialogOpen(false);
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        onClick={handleDeleteUser}
                                        isLoading={isDeletingUser}
                                      >
                                        Delete
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    Organization Status Distribution
                  </CardTitle>
                  <CardDescription>
                    Breakdown of organizations by status
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      active: { label: "Active", color: "#10b981" },
                      pending: { label: "Pending", color: "#f59e0b" },
                      inactive: { label: "Inactive", color: "#ef4444" },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) =>
                            `${name}: ${(percent * 100).toFixed(0)}%`
                          }
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-green-500" />
                    Total Supplies Inventory
                  </CardTitle>
                  <CardDescription>
                    Overall supply distribution across all organizations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      medical: { label: "Medical", color: "#ef4444" },
                      food: { label: "Food", color: "#f59e0b" },
                      water: { label: "Water", color: "#3b82f6" },
                      shelter: { label: "Shelter", color: "#10b981" },
                      equipment: { label: "Equipment", color: "#8b5cf6" },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={suppliesChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-purple-500" />
                    Organizations by Region
                  </CardTitle>
                  <CardDescription>
                    Distribution of organizations across regions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      organizations: {
                        label: "Organizations",
                        color: "#3b82f6",
                      },
                      volunteers: { label: "Volunteers", color: "#10b981" },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={regionData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="region" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Bar dataKey="organizations" fill="#3b82f6" />
                        <Bar dataKey="volunteers" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-orange-500" />
                    Volunteers & Funding by Organization
                  </CardTitle>
                  <CardDescription>
                    Comparison of volunteer count and funding levels
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      volunteers: { label: "Volunteers", color: "#3b82f6" },
                      funding: { label: "Funding ($)", color: "#10b981" },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={volunteerTrendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="name"
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="volunteers"
                          stackId="1"
                          stroke="#3b82f6"
                          fill="#3b82f6"
                          fillOpacity={0.6}
                        />
                        <Area
                          yAxisId="right"
                          type="monotone"
                          dataKey="funding"
                          stackId="2"
                          stroke="#10b981"
                          fill="#10b981"
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Register Organization */}
          <TabsContent value="register" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-green-500" />
                  {t("admin.registerOrg")}
                </CardTitle>
                <CardDescription>
                  Add a new organization to the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="org-name">Organization Name *</Label>
                      <Input
                        id="org-name"
                        value={newOrg.name}
                        onChange={(e) =>
                          setNewOrg((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder="Enter organization name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="org-email">Email *</Label>
                      <Input
                        id="org-email"
                        type="email"
                        value={newOrg.email}
                        onChange={(e) =>
                          setNewOrg((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                        placeholder="Enter email address"
                      />
                    </div>

                    <div>
                      <Label htmlFor="org-phone">Phone *</Label>
                      <Input
                        id="org-phone"
                        value={newOrg.phone}
                        onChange={(e) =>
                          setNewOrg((prev) => ({
                            ...prev,
                            phone: e.target.value,
                          }))
                        }
                        placeholder="Enter phone number"
                      />
                    </div>

                    <div>
                      <Label htmlFor="org-password">Password</Label>
                      <Input
                        id="org-password"
                        type="password"
                        value={newOrg.password}
                        onChange={(e) =>
                          setNewOrg((prev) => ({
                            ...prev,
                            password: e.target.value,
                          }))
                        }
                        placeholder="Enter password"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="org-region">Region *</Label>
                      <Select
                        value={newOrg.region}
                        onValueChange={(value) =>
                          setNewOrg((prev) => ({ ...prev, region: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yangon">Yangon</SelectItem>
                          <SelectItem value="Mandalay">Mandalay</SelectItem>
                          <SelectItem value="Naypyidaw">Naypyidaw</SelectItem>
                          <SelectItem value="Sagaing">Sagaing</SelectItem>
                          <SelectItem value="Bago">Bago</SelectItem>
                          <SelectItem value="Magway">Magway</SelectItem>
                          <SelectItem value="Tanintharyi">
                            Tanintharyi
                          </SelectItem>
                          <SelectItem value="Ayeyarwady">Ayeyarwady</SelectItem>
                          <SelectItem value="Kachin">Kachin</SelectItem>
                          <SelectItem value="Kayah">Kayah</SelectItem>
                          <SelectItem value="Kayin">Kayin</SelectItem>
                          <SelectItem value="Chin">Chin</SelectItem>
                          <SelectItem value="Mon">Mon</SelectItem>
                          <SelectItem value="Rakhine">Rakhine</SelectItem>
                          <SelectItem value="Shan">Shan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    
                    <div>
                      <Label htmlFor="org-funding">Funding</Label>
                      <Input
                        id="org-funding"
                        value={newOrg.funding}
                        onChange={(e) =>
                          setNewOrg((prev) => ({
                            ...prev,
                            funding: e.target.value,
                          }))
                        }
                        placeholder="Enter funding amount"
                      />
                    </div>

                    <div>
                      <Label htmlFor="org-address">Address</Label>
                      <Input
                        id="org-address"
                        value={newOrg.address}
                        onChange={(e) =>
                          setNewOrg((prev) => ({
                            ...prev,
                            address: e.target.value,
                          }))
                        }
                        placeholder="Enter organization address"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button onClick={handleRegisterOrganization} isLoading={isRegisteringOrg}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t("admin.registerOrg")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}