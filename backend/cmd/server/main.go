package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/adi-253/Talkie/backend/internal/config"
	"github.com/adi-253/Talkie/backend/internal/handlers"
	"github.com/adi-253/Talkie/backend/internal/services"
	"github.com/adi-253/Talkie/backend/internal/supabase"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	// Load configuration from environment
	cfg := config.Load()

	// Initialize Supabase client
	db := supabase.NewClient(cfg)

	// Initialize services
	roomService := services.NewRoomService(db)
	cleanupService := services.NewCleanupService(
		db,
		1*time.Minute, // Check every minute
		5*time.Minute, // Delete rooms inactive for 5 minutes
	)

	// Start background cleanup worker
	go cleanupService.Start()

	// Initialize handlers
	roomHandler := handlers.NewRoomHandler(roomService)
	messageService := services.NewMessageService()
	messageHandler := handlers.NewMessageHandler(messageService)

	// Set up router with middleware
	r := chi.NewRouter()

	// Middleware stack
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)

	// CORS configuration - reads from CORS_ORIGINS env var
	// Format: comma-separated list of origins, e.g., "http://localhost:5173,https://talkie.example.com"
	corsOrigins := getCorsOrigins()
	log.Printf("CORS allowed origins: %v", corsOrigins)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   corsOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check endpoint
	r.Get("/health", handlers.HealthCheck)

	// API routes
	r.Route("/api", func(r chi.Router) {
		r.Route("/rooms", func(r chi.Router) {
			r.Get("/", roomHandler.ListRooms)
			r.Post("/", roomHandler.CreateRoom)
			r.Get("/{id}", roomHandler.GetRoom)
			r.Post("/{id}/join", roomHandler.JoinRoom)
			r.Post("/{id}/leave", roomHandler.LeaveRoom)
			r.Post("/{id}/heartbeat", roomHandler.Heartbeat)
			// Message endpoints for polling fallback
			r.Get("/{id}/messages", messageHandler.GetMessages)
			r.Post("/{id}/messages", messageHandler.SendMessage)
		})
	})

	// Start server
	addr := fmt.Sprintf(":%s", cfg.ServerPort)
	log.Printf("🚀 Talkie backend starting on %s", addr)
	log.Fatal(http.ListenAndServe(addr, r))
}

// getCorsOrigins returns allowed CORS origins from environment or defaults
func getCorsOrigins() []string {
	originsEnv := os.Getenv("CORS_ORIGINS")
	if originsEnv == "" {
		// Default to localhost for development
		return []string{"http://localhost:5173", "http://localhost:3000"}
	}
	
	// Split comma-separated origins and trim whitespace
	origins := strings.Split(originsEnv, ",")
	for i, origin := range origins {
		origins[i] = strings.TrimSpace(origin)
	}
	return origins
}

