package middleware

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	// Kubeflow standard headers
	UserIDHeader = "kubeflow-userid"
	UserIDPrefix = ""
	
	// Context keys
	UserEmailKey     = "user-email"
	UserNamespaceKey = "user-namespace"
)

// KubeflowAuthMiddleware extracts user identity from Kubeflow headers
// Note: Namespace is obtained from /api/workgroup/env-info by the frontend
func KubeflowAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract user email from Kubeflow header
		userEmail := c.GetHeader(UserIDHeader)
		if userEmail == "" {
			log.Println("Warning: No kubeflow-userid header found, using anonymous")
			userEmail = "anonymous@kubeflow.org"
		}

		// Remove prefix if exists
		if UserIDPrefix != "" && strings.HasPrefix(userEmail, UserIDPrefix) {
			userEmail = strings.TrimPrefix(userEmail, UserIDPrefix)
		}

		log.Printf("Authenticated user: %s", userEmail)

		// Store user email in context
		c.Set(UserEmailKey, userEmail)

		// Namespace should come from request (set by frontend from /api/workgroup/env-info)
		// No longer deriving namespace from email

		c.Next()
	}
}

// GetUserEmail retrieves user email from Gin context
func GetUserEmail(c *gin.Context) string {
	email, exists := c.Get(UserEmailKey)
	if !exists {
		return "anonymous@kubeflow.org"
	}
	return email.(string)
}

// GetUserNamespace retrieves user namespace from Gin context
// Namespace should be set by the request (from frontend via /api/workgroup/env-info)
func GetUserNamespace(c *gin.Context) string {
	namespace, exists := c.Get(UserNamespaceKey)
	if !exists {
		// Fallback to default if not set
		return "default"
	}
	return namespace.(string)
}

// NamespaceAccessMiddleware validates that user can access requested namespace
func NamespaceAccessMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get user's namespace
		userNamespace := GetUserNamespace(c)
		
		// Check if namespace is specified in query or path
		requestedNamespace := c.Query("namespace")
		if requestedNamespace == "" {
			requestedNamespace = c.Param("namespace")
		}

		// If no namespace requested, use user's namespace
		if requestedNamespace == "" {
			c.Set("target-namespace", userNamespace)
			c.Next()
			return
		}

		// Validate access: user can only access their own namespace
		// unless they have cluster-admin role (checked via Kubernetes RBAC)
		if requestedNamespace != userNamespace {
			// TODO: Add SubjectAccessReview check for cluster-admin
			log.Printf("Warning: User in namespace %s attempting to access %s", 
				userNamespace, requestedNamespace)
		}

		c.Set("target-namespace", requestedNamespace)
		c.Next()
	}
}

// GetTargetNamespace retrieves the target namespace for operations
func GetTargetNamespace(c *gin.Context) string {
	namespace, exists := c.Get("target-namespace")
	if !exists {
		return GetUserNamespace(c)
	}
	return namespace.(string)
}

// CORSMiddleware handles CORS for Kubeflow integration
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", 
			"Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, "+
			"Authorization, accept, origin, Cache-Control, X-Requested-With, "+
			UserIDHeader) // Add Kubeflow userid header
		c.Writer.Header().Set("Access-Control-Allow-Methods", 
			"POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
