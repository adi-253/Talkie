package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// Config holds all environment configuration values for the application.
// These values are loaded from a .env file at startup.
type Config struct {
	// SupabaseURL is the URL of your Supabase project
	SupabaseURL string

	// SupabaseKey is the service role key for backend operations
	// This key has elevated privileges and should never be exposed to clients
	SupabaseKey string

	// ServerPort is the port the HTTP server listens on
	ServerPort string
}

// Load reads environment variables and returns a populated Config struct.
// It will load from a .env file if present, then read from environment variables.
// Falls back to sensible defaults if values are not set.
func Load() *Config {
	// Attempt to load .env file - not an error if it doesn't exist
	// as we may be running in production with real environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	config := &Config{
		SupabaseURL: getEnv("SUPABASE_URL", ""),
		SupabaseKey: getEnv("SUPABASE_SERVICE_ROLE_KEY", ""),
		ServerPort:  getEnv("PORT", "8080"),
	}

	// Validate required configuration
	if config.SupabaseURL == "" {
		log.Println("WARNING: SUPABASE_URL is not set")
	}
	if config.SupabaseKey == "" {
		log.Println("WARNING: SUPABASE_SERVICE_ROLE_KEY is not set")
	}

	return config
}

// getEnv retrieves an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
