.PHONY: dev-backend dev-frontend docker-build docker-up docker-down

dev-backend:
	cd backend && uvicorn main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

docker-build:
	docker-compose build

docker-up:
	docker-compose up

docker-down:
	docker-compose down
