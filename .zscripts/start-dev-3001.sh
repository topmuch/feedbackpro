#!/bin/bash
# Lance le dev server FeedbackPro sur le port 3001 (détaché du shell parent).
cd /home/z/feedbackpro || exit 1
exec env \
  DATABASE_URL="file:/home/z/feedbackpro/data/feedbackpro.db" \
  NEXT_PUBLIC_APP_URL="http://localhost:3001" \
  node /home/z/feedbackpro/node_modules/.bin/next dev -p 3001
