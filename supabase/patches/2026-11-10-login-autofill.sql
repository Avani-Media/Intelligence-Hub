-- Standard login semantics for password managers; preserve field IDs and auth handlers.
update public.hub_runtime_base
set html=replace(replace(replace(html,'<form class="cloud-auth-form" id="cloudAuthForm">','<form class="cloud-auth-form" id="cloudAuthForm" name="login" autocomplete="on">'),'<label>Email<input id="cloudEmail" type="email" autocomplete="email"','<label for="cloudEmail">Email<input id="cloudEmail" name="username" type="email" autocomplete="username" autocapitalize="none" spellcheck="false"'),'<label>Password<input id="cloudPassword" type="password" autocomplete="current-password"','<label for="cloudPassword">Password<input id="cloudPassword" name="password" type="password" autocomplete="current-password"'),version=version+1,updated_at=now()
where slot='main' and md5(html)='db8223f8328508e7d9e30ea255a686c6'
returning slot,version,md5(html) html_md5;
