# Deployment Guide (AWS EC2 + RDS MySQL)

Every command below was run on the Ubuntu EC2 server for this project.

```
Browser -> Nginx (port 80) -> Node.js app (port 3000, kept alive by pm2) -> RDS MySQL (private)
```

## 1. Connect to the server

Run on your own computer, in the folder with the key file:

```bash
ssh -i your-key.pem ubuntu@<EC2-public-IP>
```

If you see "Permissions are too open", run `chmod 400 your-key.pem` first (Linux/Mac).

## 2. Install Git and Node.js

```bash
sudo apt update
sudo apt install -y git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 3. Get the code and install dependencies

```bash
mkdir -p ~/app && cd ~/app
git clone https://github.com/<username>/<repo>.git user-information
cd user-information
npm install
```

## 4. Configure the database connection (.env)

```bash
cp .env.example .env
nano .env
```

Save with `Ctrl+O`, `Enter`, then exit with `Ctrl+X`.

```
PORT=3000
DB_HOST=<RDS-endpoint>
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=<RDS master password>
DB_NAME=userinfo
ADMIN_USER=admin
ADMIN_PASSWORD=<separate admin password, 8+ characters>
```

Rules: no `<` `>` around values, no spaces around `=`, and `DB_HOST` is only the endpoint (no `http://`, no `:3306`).

Test:

```bash
node server.js
```

Expected output: `Server running on port 3000`. The app creates the `users` table automatically. Stop with `Ctrl+C`.

## 5. Keep the app running with pm2

```bash
sudo npm install -g pm2
pm2 start server.js --name user-information
pm2 save
pm2 startup
```

`pm2 startup` prints a line starting with `sudo env PATH=...`. Copy and run that whole line, then:

```bash
pm2 save
pm2 status
```

`user-information` should show **online**. Useful commands:

```bash
pm2 logs user-information --lines 20
pm2 restart user-information
```

## 6. Serve on port 80 with Nginx

```bash
sudo apt install -y nginx
sudo tee /etc/nginx/conf.d/app.conf > /dev/null <<'EOF'
server {
    listen 80;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
EOF
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl status nginx
```

`nginx -t` must print `syntax is ok` and `test is successful`. The default site is removed so the Nginx welcome page does not hide the app.

## 7. Verify in the browser

- `http://<EC2-public-IP>/api/health` returns `{"ok":true}`
- `http://<EC2-public-IP>` shows the form
- `http://<EC2-public-IP>/admin` asks for `ADMIN_USER` / `ADMIN_PASSWORD` and shows the table

## 8. Check the data in RDS (MySQL client)

```bash
sudo apt install -y mysql-client-core
mysql -h <RDS-endpoint> -u admin -p userinfo
```

Enter the RDS password. At the `mysql>` prompt:

```sql
SELECT * FROM users;
SHOW TABLES;
DESCRIBE users;
SELECT COUNT(*) FROM users;
exit
```

One-line version:

```bash
mysql -h <RDS-endpoint> -u admin -p userinfo -e "SELECT * FROM users;"
```

SQL statements only work inside `mysql>`. Typing `SELECT ...` in the normal shell gives "command not found".

## 9. Deploy a code change

```bash
cd ~/app/user-information
git pull
npm install
pm2 restart user-information
```

`.env` is in `.gitignore`, so `git pull` never overwrites it.

## AWS settings used

| Item | Setting |
| --- | --- |
| EC2 | Ubuntu, t3.micro, default VPC |
| EC2 security group | SSH 22 from My IP, HTTP 80 from 0.0.0.0/0 |
| RDS | MySQL, Free tier, Public access: No, initial DB name `userinfo` |
| RDS connection | "Connect to an EC2 compute resource" (AWS adds `rds-ec2-X` and `ec2-rds-X` security groups, 3306 open only to EC2) |

## Errors I hit and the fixes

| Error | Cause | Fix |
| --- | --- | --- |
| `getaddrinfo ENOTFOUND <database-1...>` | `<` `>` left around `DB_HOST` | Remove them from `.env` |
| `Command 'mysql' not found` | Client not installed | `sudo apt install -y mysql-client-core` |
| `SELECT: command not found` | SQL typed in the shell | Run it inside `mysql>` or with `-e` |
| Nginx welcome page | Default site still enabled | `sudo rm -f /etc/nginx/sites-enabled/default` and restart |
| App not reachable | Port 80 closed or IP changed | Check the security group and the current Public IP |

## Cleanup (avoid charges)

1. RDS: Actions > Delete, untick "Create final snapshot" and "Retain automated backups".
2. EC2: Instance state > Terminate instance.
3. Check EC2 > Volumes and Elastic IPs for leftovers.
