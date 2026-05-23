// services/approvalWorkflowService.js
const Notification = require('../models/notification');
const User = require('../models/user');
const { USER_ROLES, QUOTATION_STATUSES } = require('../models/constants');

class ApprovalWorkflowService {
  
  /**
   * Submit quotation for approval
   */
  async submitForApproval(quotation, userId, comments = '') {
    const user = await User.findById(userId);
    
    // Update quotation status based on user role
    if (user.role === USER_ROLES.ADMIN) {
      // Admin submits directly to admin approval (skip manager)
      quotation.status = QUOTATION_STATUSES.PENDING_ADMIN;
    } else {
      // Regular user submits to manager approval
      quotation.status = QUOTATION_STATUSES.PENDING;
    }
    
    // Add approval workflow tracking
    quotation.approvalWorkflow = {
      status: user.role === USER_ROLES.ADMIN ? 'pending_admin' : 'pending_manager',
      currentLevel: user.role === USER_ROLES.ADMIN ? 'admin' : 'manager',
      submittedBy: {
        userId,
        userName: user.name,
        userRole: user.role,
        submittedAt: new Date()
      },
      approvalHistory: [{
        action: 'submitted',
        level: 'user',
        userId,
        userName: user.name,
        comments,
        timestamp: new Date()
      }]
    };
    
    await quotation.save();
    
    // Get approvers based on user role
    let approvers = [];
    
    if (user.role === USER_ROLES.ADMIN) {
      // Notify admins
      approvers = await User.find({
        companyId: quotation.companyId,
        role: USER_ROLES.ADMIN,
        isActive: true,
        _id: { $ne: userId }
      });
    } else {
      // Notify managers
      approvers = await User.find({
        companyId: quotation.companyId,
        role: USER_ROLES.OPS_MANAGER,
        isActive: true
      });
    }
    
    // Create notifications for approvers
    const notifications = approvers.map(approver => ({
      companyId: quotation.companyId,
      userId: approver._id,
      type: 'approval_needed',
      title: 'Quotation Pending Approval',
      message: `${user.name} has submitted "${quotation.quotationNumber}" for approval`,
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      actionUrl: `/quotations/${quotation._id}/review`,
      priority: 'high',
      metadata: {
        fromUserId: userId,
        fromUserName: user.name,
        fromUserRole: user.role,
        comments,
        total: quotation.total,
        customer: quotation.customerSnapshot?.name,
        projectName: quotation.projectName
      }
    }));
    
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
    
    return { 
      success: true, 
      message: 'Quotation submitted for approval',
      notifiedCount: notifications.length
    };
  }
  
  /**
   * Approve quotation (Manager or Admin)
   */
  async approveQuotation(quotation, userId, comments = '') {
    const user = await User.findById(userId);
    const currentLevel = quotation.approvalWorkflow?.currentLevel;
    
    if (user.role === USER_ROLES.OPS_MANAGER && currentLevel === 'manager') {
      // Manager approval
      quotation.status = QUOTATION_STATUSES.PENDING_ADMIN;
      quotation.opsApprovedBy = userId;
      quotation.opsApprovedAt = new Date();
      quotation.opsApprovedBySnapshot = {
        name: user.name,
        email: user.email,
        role: user.role,
        approvedAt: new Date()
      };
      
      if (quotation.approvalWorkflow) {
        quotation.approvalWorkflow.status = 'pending_admin';
        quotation.approvalWorkflow.currentLevel = 'admin';
        quotation.approvalWorkflow.managerApproval = {
          status: 'approved',
          userId,
          userName: user.name,
          approvedAt: new Date(),
          comments
        };
        quotation.approvalWorkflow.approvalHistory.push({
          action: 'approved',
          level: 'manager',
          userId,
          userName: user.name,
          comments,
          timestamp: new Date()
        });
      }
      
      await quotation.save();
      
      // Notify admins
      const admins = await User.find({
        companyId: quotation.companyId,
        role: USER_ROLES.ADMIN,
        isActive: true
      });
      
      const adminNotifications = admins.map(admin => ({
        companyId: quotation.companyId,
        userId: admin._id,
        type: 'approval_needed',
        title: 'Quotation Pending Admin Approval',
        message: `Manager ${user.name} has approved "${quotation.quotationNumber}". Waiting for your approval.`,
        quotationId: quotation._id,
        quotationNumber: quotation.quotationNumber,
        actionUrl: `/quotations/${quotation._id}/review`,
        priority: 'high',
        metadata: {
          fromUserId: userId,
          fromUserName: user.name,
          comments,
          total: quotation.total,
          customer: quotation.customerSnapshot?.name,
          projectName: quotation.projectName
        }
      }));
      
      await Notification.insertMany(adminNotifications);
      
      return { 
        success: true, 
        message: 'Quotation approved by manager. Waiting for admin approval.',
        nextLevel: 'admin'
      };
      
    } else if (user.role === USER_ROLES.ADMIN) {
      // Admin approval - final
      quotation.status = QUOTATION_STATUSES.APPROVED;
      quotation.approvedBy = userId;
      quotation.approvedAt = new Date();
      quotation.approvedBySnapshot = {
        name: user.name,
        email: user.email,
        role: user.role,
        approvedAt: new Date()
      };
      
      if (quotation.approvalWorkflow) {
        quotation.approvalWorkflow.status = 'approved';
        quotation.approvalWorkflow.currentLevel = 'completed';
        quotation.approvalWorkflow.adminApproval = {
          status: 'approved',
          userId,
          userName: user.name,
          approvedAt: new Date(),
          comments
        };
        quotation.approvalWorkflow.approvalHistory.push({
          action: 'approved',
          level: 'admin',
          userId,
          userName: user.name,
          comments,
          timestamp: new Date()
        });
      }
      
      await quotation.save();
      
      // Notify the creator
      if (quotation.approvalWorkflow?.submittedBy?.userId) {
        await this.createNotification(
          quotation.companyId,
          quotation.approvalWorkflow.submittedBy.userId,
          'quotation_approved',
          'Quotation Approved',
          `Your quotation ${quotation.quotationNumber} has been fully approved!`,
          quotation._id,
          quotation.quotationNumber,
          `/quotations/${quotation._id}`,
          'high',
          { fromUserId: userId, fromUserName: user.name, comments }
        );
      }
      
      return { 
        success: true, 
        message: 'Quotation fully approved!',
        finalApproved: true
      };
    }
    
    throw new Error('You are not authorized to approve this quotation');
  }
  
  /**
   * Reject quotation
   */
  async rejectQuotation(quotation, userId, comments = '') {
    const user = await User.findById(userId);
    const currentLevel = quotation.approvalWorkflow?.currentLevel;
    
    quotation.status = QUOTATION_STATUSES.REJECTED;
    quotation.rejectionReason = comments;
    
    if (user.role === USER_ROLES.OPS_MANAGER) {
      quotation.opsRejectionReason = comments;
    }
    
    if (quotation.approvalWorkflow) {
      quotation.approvalWorkflow.status = 'rejected';
      quotation.approvalWorkflow.currentLevel = 'completed';
      
      if (currentLevel === 'manager') {
        quotation.approvalWorkflow.managerApproval = {
          status: 'rejected',
          userId,
          userName: user.name,
          approvedAt: new Date(),
          comments
        };
      } else if (currentLevel === 'admin') {
        quotation.approvalWorkflow.adminApproval = {
          status: 'rejected',
          userId,
          userName: user.name,
          approvedAt: new Date(),
          comments
        };
      }
      
      quotation.approvalWorkflow.approvalHistory.push({
        action: 'rejected',
        level: currentLevel,
        userId,
        userName: user.name,
        comments,
        timestamp: new Date()
      });
    }
    
    await quotation.save();
    
    // Notify the creator
    if (quotation.approvalWorkflow?.submittedBy?.userId) {
      await this.createNotification(
        quotation.companyId,
        quotation.approvalWorkflow.submittedBy.userId,
        'quotation_rejected',
        'Quotation Rejected',
        `Your quotation ${quotation.quotationNumber} was rejected by ${user.name}. Reason: ${comments}`,
        quotation._id,
        quotation.quotationNumber,
        `/quotations/${quotation._id}`,
        'high',
        { fromUserId: userId, fromUserName: user.name, comments }
      );
    }
    
    return { success: true, message: 'Quotation rejected' };
  }
  
  /**
   * Request revision
   */
  async requestRevision(quotation, userId, revisionNotes = '') {
    const user = await User.findById(userId);
    const currentLevel = quotation.approvalWorkflow?.currentLevel;
    
    quotation.status = QUOTATION_STATUSES.OPS_REJECTED; // Use ops_rejected for revision
    quotation.opsRejectionReason = revisionNotes;
    
    if (quotation.approvalWorkflow) {
      quotation.approvalWorkflow.status = 'revision_requested';
      quotation.approvalWorkflow.currentLevel = 'user';
      
      if (currentLevel === 'manager') {
        quotation.approvalWorkflow.managerApproval = {
          status: 'revision_requested',
          userId,
          userName: user.name,
          approvedAt: new Date(),
          revisionNotes
        };
      } else if (currentLevel === 'admin') {
        quotation.approvalWorkflow.adminApproval = {
          status: 'revision_requested',
          userId,
          userName: user.name,
          approvedAt: new Date(),
          revisionNotes
        };
      }
      
      quotation.approvalWorkflow.approvalHistory.push({
        action: 'revision_requested',
        level: currentLevel,
        userId,
        userName: user.name,
        comments: revisionNotes,
        timestamp: new Date()
      });
    }
    
    await quotation.save();
    
    // Notify the creator
    if (quotation.approvalWorkflow?.submittedBy?.userId) {
      await this.createNotification(
        quotation.companyId,
        quotation.approvalWorkflow.submittedBy.userId,
        'revision_requested',
        'Revision Requested',
        `${user.name} requested revisions for ${quotation.quotationNumber}. Notes: ${revisionNotes}`,
        quotation._id,
        quotation.quotationNumber,
        `/quotations/${quotation._id}/edit`,
        'high',
        { 
          fromUserId: userId, 
          fromUserName: user.name, 
          comments: revisionNotes,
          revisionNotes
        }
      );
    }
    
    return { success: true, message: 'Revision requested' };
  }
  
  /**
   * Get pending approvals for a user
   */
  async getPendingApprovals(userId, userRole, companyId) {
    let query = { companyId };
    
    if (userRole === USER_ROLES.OPS_MANAGER) {
      query = {
        ...query,
        status: QUOTATION_STATUSES.PENDING,
        opsApprovedBy: { $exists: false }
      };
    } else if (userRole === USER_ROLES.ADMIN) {
      query = {
        ...query,
        status: QUOTATION_STATUSES.PENDING_ADMIN,
        approvedBy: { $exists: false }
      };
    } else {
      return [];
    }
    
    const quotations = await Quotation.find(query)
      .populate('customerSnapshot')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    return quotations;
  }
  
  /**
   * Get approval history for a quotation
   */
  async getApprovalHistory(quotationId) {
    const quotation = await Quotation.findById(quotationId);
    if (!quotation) throw new Error('Quotation not found');
    
    return quotation.approvalWorkflow?.approvalHistory || [];
  }
  
  /**
   * Helper: Create notification
   */
  async createNotification(companyId, userId, type, title, message, quotationId, quotationNumber, actionUrl, priority = 'medium', metadata = {}) {
    const notification = new Notification({
      companyId,
      userId,
      type,
      title,
      message,
      quotationId,
      quotationNumber,
      actionUrl,
      priority,
      metadata,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    
    await notification.save();
    return notification;
  }
  
  /**
   * Get user notifications
   */
  async getUserNotifications(userId, companyId, { limit = 20, unreadOnly = false }) {
    const query = { userId, companyId };
    if (unreadOnly) query.isRead = false;
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);
    
    const unreadCount = await Notification.countDocuments({ userId, companyId, isRead: false });
    
    return { notifications, unreadCount };
  }
  
  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    return notification;
  }
  
  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId, companyId) {
    const result = await Notification.updateMany(
      { userId, companyId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    return result;
  }
  
  /**
   * Delete notification
   */
  async deleteNotification(notificationId, userId) {
    const result = await Notification.findOneAndDelete({ _id: notificationId, userId });
    return result;
  }
}

module.exports = new ApprovalWorkflowService();