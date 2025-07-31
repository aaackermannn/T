// Общие функции
let currentUser = null;

async function checkSession() {
  try {
    const response = await fetch("/api/session");
    if (response.ok) {
      currentUser = await response.json();
    }
    return currentUser;
  } catch (error) {
    console.error("Session check failed:", error);
    return null;
  }
}

async function fetchData(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
}

// Система комментариев
function initComments() {
  document.body.addEventListener("click", async (e) => {
    if (e.target.classList.contains("comments-btn")) {
      const card = e.target.closest(".card");
      const postId = card.dataset.postId;
      const container = card.querySelector(".comments-container");

      if (container.style.display === "block") {
        container.style.display = "none";
        return;
      }

      try {
        const comments = await fetchData(`/api/comments?postId=${postId}`);
        const list = container.querySelector(".comments-list");
        list.innerHTML = "";

        comments.forEach((comment) => {
          const commentEl = document.createElement("div");
          commentEl.className = "comment-item";
          commentEl.innerHTML = `
            <img src="${comment.author_avatar || "/img/svg/user.svg"}" alt="${
            comment.author_name
          }" class="author-avatar">
            <div class="comment-content">
              <span class="author-name">${comment.author_name}</span>
              <p class="comment-text">${comment.content}</p>
            </div>
            ${
              currentUser && currentUser.id == comment.user_id
                ? `<button class="comment-delete" data-id="${comment.id}" aria-label="Удалить комментарий">
                 <img src="/img/svg/trash.svg" alt="Удалить" width="16" height="16">
               </button>`
                : ""
            }
          `;
          list.appendChild(commentEl);
        });

        container.style.display = "block";
      } catch (error) {
        console.error("Failed to load comments:", error);
      }
    }

    if (e.target.classList.contains("send-comment-btn")) {
      const card = e.target.closest(".card");
      const postId = card.dataset.postId;
      const textarea = card.querySelector(".new-comment-text");
      const content = textarea.value.trim();

      if (!content) return;

      try {
        await fetchData("/api/comments", {
          method: "POST",
          body: JSON.stringify({ postId, content }),
        });
        textarea.value = "";
        // Перезагружаем комментарии
        card.querySelector(".comments-btn").click();
      } catch (error) {
        console.error("Failed to post comment:", error);
      }
    }

    if (e.target.closest(".comment-delete")) {
      const commentId = e.target.closest(".comment-delete").dataset.id;
      try {
        await fetchData(`/api/comments/${commentId}`, { method: "DELETE" });
        // Удаляем только конкретный комментарий
        e.target.closest(".comment-item").remove();
      } catch (error) {
        console.error("Failed to delete comment:", error);
      }
    }
  });
}

// Система лайков
function initLikes() {
  document.body.addEventListener("click", async (e) => {
    if (e.target.closest(".like-btn")) {
      const btn = e.target.closest(".like-btn");
      const postId = btn.closest(".card").dataset.postId;
      const likeCount = btn.querySelector(".like-count");
      const likeIcon = btn.querySelector("img");

      try {
        if (btn.classList.contains("liked")) {
          await fetchData(`/api/likes/${postId}`, { method: "DELETE" });
          btn.classList.remove("liked");
          likeIcon.src = "/img/svg/like.svg";
          likeCount.textContent = parseInt(likeCount.textContent) - 1;
        } else {
          await fetchData("/api/likes", {
            method: "POST",
            body: JSON.stringify({ postId }),
          });
          btn.classList.add("liked");
          likeIcon.src = "/img/svg/like-filled.svg";
          likeCount.textContent = parseInt(likeCount.textContent) + 1;
        }
      } catch (error) {
        console.error("Like action failed:", error);
      }
    }
  });
}

// Профиль пользователя
async function initProfile() {
  const urlParams = new URLSearchParams(window.location.search);
  const profileId =
    urlParams.get("id") || (currentUser ? currentUser.id : null);

  if (!profileId) {
    window.location.href = "/login.html";
    return;
  }

  try {
    // Загрузка данных профиля
    const profile = await fetchData(`/api/user/${profileId}`);

    // Обновление DOM
    document.getElementById("profile-name").textContent = profile.name;
    document.getElementById("profile-description").textContent =
      profile.bio || "";
    document.getElementById("profile-avatar").src =
      profile.avatar_url || "/img/svg/user.svg";

    // Проверка подписки
    const isOwnProfile = currentUser && currentUser.id == profileId;

    if (currentUser && !isOwnProfile) {
      const { isSubscribed } = await fetchData(
        `/api/subscriptions/check?targetId=${profileId}`
      );
      const subscribeBtn = document.getElementById("subscribe-btn");
      subscribeBtn.style.display = "block";
      subscribeBtn.textContent = isSubscribed ? "Отписаться" : "Подписаться";
      subscribeBtn.onclick = () => toggleSubscription(profileId, isSubscribed);
    } else if (isOwnProfile) {
      document.getElementById("new-post-section").style.display = "block";
    }

    // Скрываем кнопки редактирования в чужом профиле
    document.getElementById("edit-name-btn").style.display = isOwnProfile
      ? "inline-block"
      : "none";
    document.getElementById("edit-description-btn").style.display = isOwnProfile
      ? "inline-block"
      : "none";
    document.getElementById("change-avatar-btn").style.display = isOwnProfile
      ? "inline-block"
      : "none";

    const posts = await fetchData(`/api/user/${profileId}/posts`);
    renderPosts(posts, document.getElementById("posts-container"));

    if (isOwnProfile) {
      initProfileEditor();
      initPostCreator();
    }
  } catch (error) {
    console.error("Profile load failed:", error);
  }
}

async function toggleSubscription(targetId, isSubscribed) {
  try {
    if (isSubscribed) {
      await fetchData(`/api/subscriptions/${targetId}`, { method: "DELETE" });
    } else {
      await fetchData("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify({ targetId }),
      });
    }

    // Обновляем кнопку
    const subscribeBtn = document.getElementById("subscribe-btn");
    subscribeBtn.textContent = isSubscribed ? "Подписаться" : "Отписаться";
    subscribeBtn.onclick = () => toggleSubscription(targetId, !isSubscribed);
  } catch (error) {
    console.error("Subscription toggle failed:", error);
  }
}

function initProfileEditor() {
  // Редактирование имени
  document.getElementById("edit-name-btn").addEventListener("click", () => {
    const nameEl = document.getElementById("profile-name");
    const newName = prompt("Введите новое имя:", nameEl.textContent);
    if (newName) {
      fetchData("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ name: newName }),
      })
        .then(() => {
          nameEl.textContent = newName;
        })
        .catch(console.error);
    }
  });

  // Редактирование описания
  document
    .getElementById("edit-description-btn")
    .addEventListener("click", () => {
      const bioEl = document.getElementById("profile-description");
      const newBio = prompt("Введите описание:", bioEl.textContent);
      if (newBio !== null) {
        fetchData("/api/profile", {
          method: "PUT",
          body: JSON.stringify({ bio: newBio }),
        })
          .then(() => {
            bioEl.textContent = newBio;
          })
          .catch(console.error);
      }
    });

  // Загрузка аватарки
  document.getElementById("change-avatar-btn").addEventListener("click", () => {
    document.getElementById("avatar-upload").click();
  });

  document
    .getElementById("avatar-upload")
    .addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("avatar", file);

      try {
        const response = await fetch("/api/profile/avatar", {
          method: "POST",
          body: formData,
        });

        const result = await response.json();
        document.getElementById("profile-avatar").src = result.avatarUrl;
      } catch (error) {
        console.error("Avatar upload failed:", error);
      }
    });
}

function initPostCreator() {
  document
    .getElementById("send-post-btn")
    .addEventListener("click", async () => {
      const textarea = document.getElementById("new-post-text");
      const content = textarea.value.trim();

      if (!content) return;

      try {
        const newPost = await fetchData("/api/posts", {
          method: "POST",
          body: JSON.stringify({ content }),
        });

        // Добавляем новый пост в ленту
        const container = document.getElementById("posts-container");
        const postElement = createPostElement(newPost);
        container.insertBefore(postElement, container.firstChild);

        textarea.value = "";
      } catch (error) {
        console.error("Post creation failed:", error);
      }
    });
}

function createPostElement(post) {
  const postEl = document.createElement("article");
  postEl.className = "card";
  postEl.dataset.postId = post.id;
  postEl.innerHTML = `
    <header class="card-header">
      <img class="author-avatar" src="${
        post.author_avatar || "/img/svg/user.svg"
      }" alt="${post.author_name}">
      <h2 class="author-name">${post.author_name}</h2>
    </header>
    <section class="card-body">
      <p>${post.content}</p>
    </section>
    <footer class="card-footer">
      <button class="like-btn ${post.liked ? "liked" : ""}" aria-label="Лайк">
        <img src="/img/svg/${
          post.liked ? "like-filled" : "like"
        }.svg" width="24" height="24" alt="">
        <span class="like-count">${post.likes_count}</span>
      </button>
      <button class="comments-btn" aria-label="Комментарии">Комментарии ${
        post.comments_count
      }</button>
      ${
        currentUser && currentUser.id == post.user_id
          ? `<button class="delete-post" aria-label="Удалить">
           <img src="/img/svg/trash.svg" alt="Удалить">
         </button>`
          : ""
      }
    </footer>
    <div class="comments-container">
      <div class="comments-list"></div>
      <div class="new-comment">
        <textarea class="new-comment-text" rows="4" placeholder="Написать комментарий…"></textarea>
        <div class="comment-actions">
          <button class="send-comment-btn">Отправить</button>
        </div>
      </div>
    </div>
  `;
  return postEl;
}

// Поиск
function initSearch() {
  const searchInput = document.getElementById("global-search");
  const filterButtons = document.querySelectorAll(".filter-btn");
  const resultsContainer = document.getElementById("results");
  let currentType = window.location.pathname.includes("users")
    ? "users"
    : "posts";

  // Установка активного фильтра
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type;
      performSearch();
    });

    if (btn.dataset.type === currentType) {
      btn.classList.add("active");
    }
  });

  // Обработка ввода
  searchInput.addEventListener("input", performSearch);

  // Выполнение поиска
  async function performSearch() {
    const query = searchInput.value.trim();

    if (query.length < 2) {
      resultsContainer.innerHTML =
        '<p class="no-results">Введите минимум 2 символа</p>';
      return;
    }

    try {
      const results = await fetchData(
        `/api/search?q=${encodeURIComponent(query)}&type=${currentType}`
      );
      renderResults(results, currentType);
    } catch (error) {
      resultsContainer.innerHTML = '<p class="error">Ошибка поиска</p>';
    }
  }

  // Отображение результатов
  function renderResults(results, type) {
    resultsContainer.innerHTML = "";

    if (results.length === 0) {
      resultsContainer.innerHTML =
        '<p class="no-results">Ничего не найдено</p>';
      return;
    }

    if (type === "users") {
      results.forEach((user) => {
        const userEl = document.createElement("div");
        userEl.className = "user-item";
        userEl.innerHTML = `
          <img src="${user.avatar_url || "/img/svg/user.svg"}" alt="${
          user.name
        }" class="author-avatar">
          <a href="/profile.html?id=${user.id}" class="user-name">${
          user.name
        }</a>
        `;
        resultsContainer.appendChild(userEl);
      });
    } else {
      results.forEach((post) => {
        const postEl = document.createElement("div");
        postEl.className = "search-result-post";
        postEl.innerHTML = `
          <div class="post-author">
            <img src="${post.author_avatar || "/img/svg/user.svg"}" alt="${
          post.author_name
        }" class="author-avatar">
            <span class="author-name">${post.author_name}</span>
          </div>
          <p>${post.content}</p>
          <a href="/index.html#post-${
            post.id
          }" class="post-link">Перейти к посту</a>
        `;
        resultsContainer.appendChild(postEl);
      });
    }
  }

  // Инициализация
  if (searchInput.value) performSearch();
}

// Главная страница
async function initFeed() {
  try {
    let posts = await fetchData("/api/feed");

    // Фильтруем посты - скрываем посты текущего пользователя
    if (currentUser) {
      posts = posts.filter((post) => post.user_id !== currentUser.id);
    }

    renderPosts(posts, document.querySelector(".feed"));
  } catch (error) {
    console.error("Failed to load feed:", error);
  }
}

function renderPosts(posts, container) {
  container.innerHTML = "";

  posts.forEach((post) => {
    const postEl = document.createElement("article");
    postEl.className = "card";
    postEl.dataset.postId = post.id;
    postEl.id = `post-${post.id}`;
    postEl.innerHTML = `
      <header class="card-header">
        <img class="author-avatar" src="${
          post.author_avatar || "/img/svg/user.svg"
        }" alt="${post.author_name}">
        <h2 class="author-name">${post.author_name}</h2>
      </header>
      <section class="card-body">
        <p>${post.content}</p>
      </section>
      <footer class="card-footer">
        <button class="like-btn ${post.liked ? "liked" : ""}" aria-label="Лайк">
          <img src="/img/svg/${
            post.liked ? "like-filled" : "like"
          }.svg" width="24" height="24" alt="">
          <span class="like-count">${post.likes_count}</span>
        </button>
        <button class="comments-btn" aria-label="Комментарии">Комментарии ${
          post.comments_count
        }</button>
        ${
          currentUser && currentUser.id == post.user_id
            ? `<button class="delete-post" aria-label="Удалить">
             <img src="/img/svg/trash.svg" alt="Удалить">
           </button>`
            : ""
        }
      </footer>
      <div class="comments-container">
        <div class="comments-list"></div>
        <div class="new-comment">
          <textarea class="new-comment-text" rows="4" placeholder="Написать комментарий…"></textarea>
          <div class="comment-actions">
            <button class="send-comment-btn">Отправить</button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(postEl);
  });
}

// Аутентификация
function initAuth() {
  // Форма входа
  document
    .getElementById("login-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const login = document.getElementById("login").value;
      const password = document.getElementById("password").value;

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, password }),
        });

        if (response.ok) {
          window.location.href = "/index.html";
        } else {
          alert("Ошибка входа! Проверьте данные.");
        }
      } catch (error) {
        console.error("Login failed:", error);
      }
    });

  // Форма регистрации
  document
    .getElementById("signup-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const login = document.getElementById("signup-login").value;
      const password = document.getElementById("signup-password").value;
      const repeat = document.getElementById("repeat-password").value;

      if (password !== repeat) {
        alert("Пароли не совпадают!");
        return;
      }

      try {
        const response = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, password, repeat_password: repeat }),
        });

        if (response.ok) {
          window.location.href = "/profile.html";
        } else {
          const errorData = await response.json();
          alert(errorData.error || "Ошибка регистрации!");
        }
      } catch (error) {
        console.error("Signup failed:", error);
      }
    });
}

// Обновление шапки сайта
async function updateHeader() {
  const container = document.getElementById("header-actions");
  if (!container) return;

  if (currentUser) {
    container.innerHTML = `
      <a href="/logout" class="action-link">
        Выйти
        <img src="/img/svg/logout.svg" alt="Выйти">
      </a>
      <a href="/profile.html?id=${currentUser.id}" class="action-link">
        <img src="/img/svg/profile.svg" alt="Профиль" width="24" height="24">
      </a>
    `;
  } else {
    container.innerHTML = `
      <a href="/signup.html" class="action-link">
        Зарегистрироваться
        <img src="/img/svg/login.svg" alt="Регистрация">
      </a>
      <a href="/login.html" class="action-link">
        Войти
        <img src="/img/svg/login.svg" alt="Вход">
      </a>
    `;
  }
}

// Инициализация страницы
document.addEventListener("DOMContentLoaded", async () => {
  await checkSession();
  updateHeader();
  initAuth();

  // Инициализация общих систем
  initComments();
  initLikes();

  // Инициализация специфичных страниц
  if (document.querySelector(".feed")) {
    initFeed();
  }

  if (document.getElementById("profile-name")) {
    initProfile();
  }

  if (document.getElementById("global-search")) {
    initSearch();
  }

  // Обработка удаления постов
  document.body.addEventListener("click", async (e) => {
    if (
      e.target.classList.contains("delete-post") ||
      e.target.closest(".delete-post")
    ) {
      const deleteBtn = e.target.classList.contains("delete-post")
        ? e.target
        : e.target.closest(".delete-post");

      const postId = deleteBtn.closest(".card").dataset.postId;
      try {
        await fetchData(`/api/posts/${postId}`, { method: "DELETE" });
        deleteBtn.closest(".card").remove();
      } catch (error) {
        console.error("Failed to delete post:", error);
      }
    }
  });
});
